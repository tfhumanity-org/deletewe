import { describe, expect, it } from 'vitest';
import { createLogger, MemorySink, redact } from './logger.ts';

describe('redact', () => {
  it('removes supplied secret values', () => {
    expect(redact('failed for Ada Lovelace at 12 St James Square', ['Ada Lovelace', '12 St James Square'])).toBe(
      'failed for [redacted] at [redacted]',
    );
  });

  it('is case-insensitive about supplied secrets', () => {
    expect(redact('name: ada lovelace', ['Ada Lovelace'])).toBe('name: [redacted]');
  });

  it('removes email addresses it was never told about', () => {
    expect(redact('bounced from someone@example.com')).toBe('bounced from [email]');
  });

  it('removes phone numbers', () => {
    expect(redact('called (510) 555-0147 twice')).toBe('called [phone] twice');
  });

  it('removes US-style street addresses', () => {
    expect(redact('found at 1600 Pennsylvania Avenue in the listing')).toContain('[address]');
  });

  it('removes dates that could be a date of birth', () => {
    expect(redact('dob 1979-04-02 matched')).toBe('dob [date] matched');
  });

  it('ignores very short secrets that would redact everything', () => {
    expect(redact('a listing was found', ['a'])).toBe('a listing was found');
  });

  it('caps length so a whole broker page cannot land in a log line', () => {
    expect(redact('x'.repeat(10_000))).toHaveLength(2000);
  });
});

describe('logger', () => {
  it('merges bound fields from child loggers', () => {
    const sink = new MemorySink();
    createLogger(sink, 'debug', { app: 'test' }).child({ brokerId: 'spokeo' }).info('scan_complete', { candidates: 2 });
    expect(sink.records[0]?.fields).toEqual({ app: 'test', brokerId: 'spokeo', candidates: 2 });
  });

  it('respects the minimum level', () => {
    const sink = new MemorySink();
    const log = createLogger(sink, 'warn');
    log.debug('nope');
    log.info('nope');
    log.warn('yes');
    log.error('yes');
    expect(sink.records.map((r) => r.msg)).toEqual(['yes', 'yes']);
  });
});
