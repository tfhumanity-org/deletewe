import { describe, expect, it } from 'vitest';
import type { MatchBlock } from '@deletewe/schema';
import { bucketFor, nameSimilarity, scoreListing } from './matcher.ts';
import type { ListingSnapshot, Profile } from './types.ts';

const NOW = Date.UTC(2026, 9, 27);

const profile: Profile = {
  memberId: 'm1',
  jurisdiction: 'US-CA',
  names: [{ first: 'William', middle: 'H', last: 'Okonkwo' }],
  aliases: [{ first: 'Bill', last: 'Okonkwo' }],
  addresses: [
    {
      address: { line1: '14 Marsh Lane', city: 'Berkeley', region: 'CA', postalCode: '94704', country: 'US' },
      isCurrent: true,
    },
    {
      address: { line1: '900 North Elm Street', city: 'Portland', region: 'Oregon', postalCode: '97209-1234', country: 'US' },
      isCurrent: false,
    },
  ],
  phones: ['+1 (510) 555-0147'],
  emails: ['will.okonkwo@example.test'],
  dob: '1979-04-02',
};

const match: MatchBlock = {
  fields: { name: 0.4, locality: 0.2, region: 0.15, age: 0.25 },
  thresholds: { review: 0.5, auto_confirm: 0.9 },
  require_manual_confirmation: false,
};

const score = (snapshot: ListingSnapshot, m: MatchBlock = match) => scoreListing(profile, snapshot, m, NOW).score;

describe('nameSimilarity', () => {
  it('matches an exact name', () => {
    expect(nameSimilarity('William Okonkwo', 'William Okonkwo')).toBe(1);
  });

  it('expands a known diminutive', () => {
    expect(nameSimilarity('William Okonkwo', 'Bill Okonkwo')).toBeGreaterThan(0.95);
  });

  it('treats a middle initial as weak agreement, not a clash', () => {
    expect(nameSimilarity('William H Okonkwo', 'William Henry Okonkwo')).toBeGreaterThan(0.75);
  });

  it('ignores titles and suffixes', () => {
    expect(nameSimilarity('Dr William Okonkwo Jr', 'William Okonkwo')).toBe(1);
  });

  it('strips accents', () => {
    expect(nameSimilarity('José Álvarez', 'Jose Alvarez')).toBe(1);
  });

  // The important property: a shared given name is not evidence.
  it('scores a different surname very low even when given names agree', () => {
    expect(nameSimilarity('William Okonkwo', 'William Fitzgerald')).toBeLessThan(0.3);
  });

  it('tolerates a one-character surname typo', () => {
    expect(nameSimilarity('William Okonkwo', 'William Okonkwa')).toBeGreaterThan(0.85);
  });
});

describe('scoreListing', () => {
  it('scores a strong match near 1', () => {
    expect(score({ name: 'William Okonkwo', locality: 'Berkeley', region: 'CA', age: '47' })).toBeGreaterThan(0.95);
  });

  it('matches a past address as well as the current one', () => {
    expect(score({ name: 'William Okonkwo', locality: 'Portland', region: 'OR', age: '47' })).toBeGreaterThan(0.95);
  });

  it('expands a full state name to its abbreviation', () => {
    expect(score({ name: 'William Okonkwo', locality: 'Portland', region: 'Oregon', age: '47' })).toBeGreaterThan(0.95);
  });

  it('scores a same-surname stranger in the wrong city low', () => {
    expect(score({ name: 'Grace Okonkwo', locality: 'Miami', region: 'FL', age: '23' })).toBeLessThan(0.5);
  });

  it('scores a complete stranger near zero', () => {
    expect(score({ name: 'Hannah Lindqvist', locality: 'Tulsa', region: 'OK', age: '66' })).toBeLessThan(0.3);
  });

  it('is unaffected by broker age drift of a year', () => {
    const exact = score({ name: 'William Okonkwo', locality: 'Berkeley', region: 'CA', age: '47' });
    const drifted = score({ name: 'William Okonkwo', locality: 'Berkeley', region: 'CA', age: '46' });
    expect(drifted).toBe(exact);
  });

  it('penalises an age that is a decade out', () => {
    const near = score({ name: 'William Okonkwo', locality: 'Berkeley', region: 'CA', age: '47' });
    const far = score({ name: 'William Okonkwo', locality: 'Berkeley', region: 'CA', age: '61' });
    expect(far).toBeLessThan(near);
  });

  // Coverage discounting: a listing that only exposes a name should not reach
  // auto-confirm on the strength of that one field.
  it('discounts a listing that exposes only one weighted field', () => {
    const full = score({ name: 'William Okonkwo', locality: 'Berkeley', region: 'CA', age: '47' });
    const sparse = score({ name: 'William Okonkwo' });
    expect(sparse).toBeLessThan(full);
    expect(sparse).toBeLessThan(0.9);
  });

  it('ignores blank listing fields rather than scoring them zero', () => {
    expect(score({ name: 'William Okonkwo', locality: '  ', region: 'CA', age: '47' })).toBeGreaterThan(0.9);
  });

  it('scores an empty snapshot zero', () => {
    expect(score({})).toBe(0);
  });

  it('matches a phone number regardless of formatting', () => {
    const m: MatchBlock = { fields: { phone: 1 }, thresholds: { review: 0.5, auto_confirm: 0.9 }, require_manual_confirmation: false };
    expect(score({ phone: '510-555-0147' }, m)).toBe(1);
    expect(score({ phone: '510-555-9999' }, m)).toBe(0);
  });

  it('compares postal codes on the five-digit prefix', () => {
    const m: MatchBlock = { fields: { postal_code: 1 }, thresholds: { review: 0.5, auto_confirm: 0.9 }, require_manual_confirmation: false };
    expect(score({ postal_code: '97209' }, m)).toBe(1);
  });

  it('normalises street abbreviations', () => {
    const m: MatchBlock = { fields: { street: 1 }, thresholds: { review: 0.5, auto_confirm: 0.9 }, require_manual_confirmation: false };
    expect(score({ street: '900 N Elm St' }, m)).toBeGreaterThan(0.9);
  });

  it('explains itself field by field', () => {
    const r = scoreListing(profile, { name: 'William Okonkwo', locality: 'Berkeley', region: 'CA' }, match, NOW);
    expect(r.comparisons.map((c) => c.field).sort()).toEqual(['locality', 'name', 'region']);
    for (const c of r.comparisons) {
      expect(c.profileValue).toBeTruthy();
      expect(c.listingValue).toBeTruthy();
    }
  });

  it('is deterministic', () => {
    const snap = { name: 'William Okonkwo', locality: 'Berkeley', region: 'CA', age: '47' };
    expect(score(snap)).toBe(score(snap));
  });
});

describe('bucketFor', () => {
  const thresholds = { review: 0.5, auto_confirm: 0.9 };
  const result = (s: number, manual = false) => ({
    score: s,
    comparisons: [],
    matcherVersion: '1.0.0',
    requiresManualConfirmation: manual,
  });

  it('discards below the review threshold', () => {
    expect(bucketFor(result(0.49), thresholds, 0.9)).toBe('discard');
  });

  it('sends a middling score to review', () => {
    expect(bucketFor(result(0.7), thresholds, 0.9)).toBe('review');
  });

  it('auto-confirms a high score when the member allows it', () => {
    expect(bucketFor(result(0.95), thresholds, 0.9)).toBe('auto_confirm');
  });

  // The member's own setting can only ever make the gate stricter.
  it('never auto-confirms when the member has not opted in', () => {
    expect(bucketFor(result(0.99), thresholds, 1.1)).toBe('review');
  });

  it('honours require_manual_confirmation regardless of score', () => {
    expect(bucketFor(result(0.99, true), thresholds, 0.9)).toBe('review');
  });
});
