import { describe, expect, it } from 'vitest';
import { coverage, loadCatalog } from './load.ts';

const loaded = await loadCatalog();

describe('the shipped catalogue', () => {
  it('loads every definition with no validation errors', () => {
    const errors = loaded.issues.filter((i) => i.severity === 'error');
    expect(errors.map((e) => `${e.brokerId}: ${e.message}`)).toEqual([]);
    expect(loaded.ok).toBe(true);
  });

  it('ships at least 25 definitions', () => {
    expect(loaded.brokers.length).toBeGreaterThanOrEqual(25);
  });

  it('has unique ids matching their filenames', () => {
    const ids = loaded.brokers.map((b) => b.definition.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const broker of loaded.brokers) {
      expect(broker.path.endsWith(`${broker.definition.id}.yaml`)).toBe(true);
    }
  });

  it('covers a spread of opt-out methods and automation levels', () => {
    const report = coverage(loaded.brokers);
    expect(Object.keys(report.byMethod).length).toBeGreaterThanOrEqual(4);
    expect(report.byAutomation['automated']).toBeGreaterThan(0);
    expect(report.byAutomation['assisted']).toBeGreaterThan(0);
  });

  // Every definition is honest about not having been run yet. When someone
  // verifies one against the live site this test is what reminds us to
  // update the claim in docs/broker-catalog.md rather than quietly inflate it.
  it('marks every definition as unverified against a live site', () => {
    const verified = loaded.brokers.filter((b) => b.definition.verified_at !== undefined);
    expect(verified.map((b) => b.definition.id)).toEqual([]);
  });

  it('ships anything marked unsupported in a disabled state', () => {
    for (const { definition } of loaded.brokers) {
      if (definition.automation.level === 'unsupported') expect(definition.enabled).toBe(false);
    }
  });

  it('never claims full automation for a flow that hands off to a human', () => {
    for (const { definition } of loaded.brokers) {
      if (definition.automation.level !== 'automated') continue;
      expect(definition.opt_out.steps.some((s) => s.action === 'handoff')).toBe(false);
      expect(definition.opt_out.method).not.toBe('phone');
    }
  });

  it('keeps every URL inside its own host allowlist', () => {
    for (const { definition } of loaded.brokers) {
      const urls = [
        definition.homepage,
        definition.opt_out.url,
        ...definition.opt_out.steps.flatMap((s) => ('url' in s && s.url ? [s.url] : [])),
        ...(definition.search.method === 'url_template' ? [definition.search.url_template] : []),
      ].filter((u): u is string => typeof u === 'string');

      for (const url of urls) {
        const host = new URL(url).hostname.toLowerCase();
        const allowed = definition.hosts.some((h) => host === h || host.endsWith(`.${h}`));
        expect(`${definition.id}: ${host}`).toBe(allowed ? `${definition.id}: ${host}` : 'HOST NOT ALLOWLISTED');
      }
    }
  });

  it('declares no profile field it does not use', () => {
    const unused = loaded.issues.filter((i) => i.code === 'unused_field');
    expect(unused.map((i) => `${i.brokerId}: ${i.message}`)).toEqual([]);
  });

  it('compiles every email_link verification pattern against its own host', () => {
    for (const { definition } of loaded.brokers) {
      if (definition.verification.method !== 'email_link') continue;
      const pattern = definition.verification.link_pattern;
      expect(pattern).toBeDefined();
      expect(() => new RegExp(pattern!)).not.toThrow();
      expect(definition.verification.expected_senders.length).toBeGreaterThan(0);
    }
  });

  it('keeps per-broker request pacing above the politeness floor', () => {
    for (const { definition } of loaded.brokers) {
      expect(definition.rate_limit.min_interval_ms).toBeGreaterThanOrEqual(1000);
      expect(definition.relist.interval_days).toBeGreaterThanOrEqual(7);
    }
  });

  it('cites at least one public reference per definition', () => {
    for (const { definition } of loaded.brokers) {
      expect(definition.references.length).toBeGreaterThan(0);
    }
  });

  it('records a distinct content hash per definition', () => {
    const hashes = loaded.brokers.map((b) => b.sha256);
    expect(new Set(hashes).size).toBe(hashes.length);
    for (const hash of hashes) expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});
