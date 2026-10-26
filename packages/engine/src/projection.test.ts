import { describe, expect, it } from 'vitest';
import { missingFields, project, render, renderSearchUrl } from './projection.ts';
import type { Profile } from './types.ts';

const NOW = Date.UTC(2026, 9, 27);

const profile: Profile = {
  memberId: 'm1',
  jurisdiction: 'US-CA',
  names: [{ first: 'Ada', middle: 'Byron', last: 'Lovelace' }],
  aliases: [{ first: 'Augusta', last: 'King' }],
  addresses: [
    {
      address: { line1: '12 St James Square', city: 'Berkeley', region: 'CA', postalCode: '94704', country: 'US' },
      isCurrent: true,
    },
  ],
  phones: ['+1 510 555 0101'],
  emails: ['ada@example.test'],
  dob: '1979-12-10',
};

describe('project', () => {
  it('returns only the declared fields', () => {
    expect(project(['full_name', 'city'], { profile, now: NOW })).toEqual({
      full_name: 'Ada Byron Lovelace',
      city: 'Berkeley',
    });
  });

  // The control that matters: undeclared data is absent from the object, not
  // merely unread. docs/threat-model.md TB4.
  it('omits undeclared sensitive fields entirely', () => {
    const p = project(['full_name'], { profile, now: NOW });
    expect(Object.keys(p)).toEqual(['full_name']);
    const serialised = JSON.stringify(p);
    expect(serialised).not.toContain('1979');
    expect(serialised).not.toContain('510');
    expect(serialised).not.toContain('Berkeley');
  });

  it('derives age from date of birth', () => {
    expect(project(['age'], { profile, now: NOW }).age).toBe('46');
  });

  it('supplies the listing url only when a listing is in context', () => {
    expect(project(['listing_url'], { profile, now: NOW }).listing_url).toBeUndefined();
    expect(
      project(['listing_url'], { profile, now: NOW, listing: { url: 'https://b.test/x' } }).listing_url,
    ).toBe('https://b.test/x');
  });

  it('joins aliases', () => {
    expect(project(['aliases'], { profile, now: NOW }).aliases).toBe('Augusta King');
  });

  it('omits fields the profile cannot supply', () => {
    const sparse: Profile = { ...profile, phones: [], dob: undefined };
    expect(project(['phone', 'dob', 'full_name'], { profile: sparse, now: NOW })).toEqual({
      full_name: 'Ada Byron Lovelace',
    });
  });
});

describe('missingFields', () => {
  it('reports declared fields the profile could not supply', () => {
    const sparse: Profile = { ...profile, phones: [] };
    const p = project(['phone', 'full_name'], { profile: sparse, now: NOW });
    expect(missingFields(['phone', 'full_name'], p)).toEqual(['phone']);
  });
});

describe('render', () => {
  it('substitutes declared placeholders', () => {
    expect(render('Hello {{full_name}} of {{city}}', { full_name: 'Ada', city: 'Berkeley' })).toBe(
      'Hello Ada of Berkeley',
    );
  });

  it('tolerates whitespace inside the braces', () => {
    expect(render('{{ full_name }}', { full_name: 'Ada' })).toBe('Ada');
  });

  // A template cannot reach a field the definition did not declare: the value
  // is not present, and the render fails loudly rather than emitting ''.
  it('throws on an undeclared field instead of emitting an empty string', () => {
    expect(() => render('{{dob}}', { full_name: 'Ada' })).toThrow(/unavailable field/);
  });

  it('strips control characters so a value cannot inject mail headers', () => {
    const injected = ['Ada', 'Bcc: attacker@evil.test'].join('\r\n');
    expect(render('Subject: {{full_name}}', { full_name: injected })).toBe('Subject: AdaBcc: attacker@evil.test');
  });

  it('leaves text with no placeholders alone', () => {
    expect(render('plain text', {})).toBe('plain text');
  });
});

describe('renderSearchUrl', () => {
  it('builds a slug from the primary name', () => {
    expect(renderSearchUrl('https://b.test/{name_slug}', profile)).toBe('https://b.test/ada-lovelace');
  });

  it('url-encodes interpolated values', () => {
    expect(renderSearchUrl('https://b.test/?c={city}&r={region}', profile)).toBe('https://b.test/?c=Berkeley&r=CA');
  });

  it('throws on an unknown token', () => {
    expect(() => renderSearchUrl('https://b.test/{ssn}', profile)).toThrow(/unknown token/);
  });

  it('throws when the profile has no name', () => {
    expect(() => renderSearchUrl('https://b.test/{name_slug}', { ...profile, names: [] })).toThrow();
  });
});
