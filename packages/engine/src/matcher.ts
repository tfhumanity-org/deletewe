import type { MatchBlock } from '@deletewe/schema';
import type { FieldComparison, ListingSnapshot, MatchResult, PersonName, Profile } from './types.ts';
import {
  ageFromDob,
  canonicalGivenName,
  nameTokens,
  normaliseEmail,
  normalisePhone,
  normalisePostalCode,
  normaliseRegion,
  normaliseStreet,
  normaliseText,
  parseAge,
} from './normalise.ts';
import { jaroWinkler, ratio } from './similarity.ts';

export const MATCHER_VERSION = '1.0.0';

/**
 * Scores one listing against one profile.
 *
 * Pure and deterministic: no I/O, no clock except the `now` passed in, so a
 * decision recorded today can be re-derived and audited later.
 *
 * The worst failure mode in the whole product is a false positive: submitting
 * a stranger's record to a broker as if it were the member's. The matcher is
 * therefore conservative — it reports what it can justify and leaves the
 * decision to the consent gate.
 */
export function scoreListing(
  profile: Profile,
  snapshot: ListingSnapshot,
  match: MatchBlock,
  now: number,
): MatchResult {
  const comparisons: FieldComparison[] = [];

  for (const [field, weight] of Object.entries(match.fields)) {
    if (weight === undefined || weight <= 0) continue;
    const listingValue = snapshot[field];
    if (!listingValue || listingValue.trim().length === 0) continue;

    const best = compareField(field, listingValue, profile, now);
    if (best) comparisons.push({ ...best, weight });
  }

  const totalWeight = comparisons.reduce((n, c) => n + c.weight, 0);
  const rawScore = totalWeight === 0 ? 0 : comparisons.reduce((n, c) => n + c.similarity * c.weight, 0) / totalWeight;

  // A listing that only matched on one weak field is not evidence. Discount
  // scores derived from a small share of the broker's declared weights so a
  // single common surname cannot auto-confirm.
  const declaredWeight = Object.values(match.fields).reduce((n, w) => n + (w ?? 0), 0);
  const coverage = declaredWeight === 0 ? 0 : totalWeight / declaredWeight;
  const score = round(rawScore * coverageFactor(coverage));

  return {
    score,
    comparisons,
    matcherVersion: MATCHER_VERSION,
    requiresManualConfirmation: match.require_manual_confirmation,
  };
}

/** Full credit above 70% field coverage, tapering to 0.6x at no coverage. */
function coverageFactor(coverage: number): number {
  if (coverage >= 0.7) return 1;
  return 0.6 + (coverage / 0.7) * 0.4;
}

function round(n: number): number {
  return Math.round(Math.max(0, Math.min(1, n)) * 1000) / 1000;
}

type Candidate = Omit<FieldComparison, 'weight'>;

function best(candidates: readonly Candidate[]): Candidate | undefined {
  let top: Candidate | undefined;
  for (const c of candidates) if (!top || c.similarity > top.similarity) top = c;
  return top;
}

function compareField(field: string, listingValue: string, profile: Profile, now: number): Candidate | undefined {
  switch (field) {
    case 'name':
      return best([...profile.names, ...profile.aliases].map((n) => compareName(field, n, listingValue)));
    case 'alias':
      return best(profile.aliases.map((n) => compareName(field, n, listingValue)));
    case 'locality':
      return best(
        profile.addresses.map(({ address }) => ({
          field,
          profileValue: address.city,
          listingValue,
          similarity: ratio(normaliseText(address.city), normaliseText(listingValue)),
        })),
      );
    case 'region':
      return best(
        profile.addresses.map(({ address }) => ({
          field,
          profileValue: address.region,
          listingValue,
          // Region is low-cardinality: it either matches or it does not.
          similarity: normaliseRegion(address.region) === normaliseRegion(listingValue) ? 1 : 0,
        })),
      );
    case 'postal_code':
      return best(
        profile.addresses.map(({ address }) => ({
          field,
          profileValue: address.postalCode,
          listingValue,
          similarity: normalisePostalCode(address.postalCode) === normalisePostalCode(listingValue) ? 1 : 0,
        })),
      );
    case 'street':
      return best(
        profile.addresses.map(({ address }) => ({
          field,
          profileValue: address.line1,
          listingValue,
          similarity: ratio(normaliseStreet(address.line1), normaliseStreet(listingValue)),
        })),
      );
    case 'phone':
      return best(
        profile.phones.map((p) => ({
          field,
          profileValue: p,
          listingValue,
          similarity: normalisePhone(p) === normalisePhone(listingValue) && normalisePhone(p).length >= 7 ? 1 : 0,
        })),
      );
    case 'email':
      return best(
        profile.emails.map((e) => ({
          field,
          profileValue: e,
          listingValue,
          similarity: normaliseEmail(e) === normaliseEmail(listingValue) ? 1 : 0,
        })),
      );
    case 'age':
      return compareAge(field, listingValue, profile, now);
    default:
      return undefined;
  }
}

function compareName(field: string, name: PersonName, listingValue: string): Candidate {
  const profileValue = [name.first, name.middle, name.last].filter(Boolean).join(' ');
  return { field, profileValue, listingValue, similarity: nameSimilarity(profileValue, listingValue) };
}

/**
 * Compares two human names token-wise.
 *
 * Surname agreement is necessary: brokers list many people per locality and a
 * shared given name alone is noise. Given names are compared after expanding
 * known diminutives, and a bare initial counts as a partial match.
 */
export function nameSimilarity(a: string, b: string): number {
  const at = nameTokens(a);
  const bt = nameTokens(b);
  if (at.length === 0 || bt.length === 0) return 0;

  const aLast = at[at.length - 1]!;
  const bLast = bt[bt.length - 1]!;
  const surname = jaroWinkler(aLast, bLast);
  if (surname < 0.8) return round(surname * 0.3);

  const aGiven = at.slice(0, -1).map(canonicalGivenName);
  const bGiven = bt.slice(0, -1).map(canonicalGivenName);
  if (aGiven.length === 0 || bGiven.length === 0) return round(surname * 0.6);

  const first = givenNameSimilarity(aGiven[0]!, bGiven[0]!);

  // Middle names only count when both sides supply one. A broker listing a
  // member's first and last name is not a weaker match for omitting the
  // middle name the member happens to have told us about.
  const aMiddle = aGiven.slice(1);
  const bMiddle = bGiven.slice(1);
  const middle =
    aMiddle.length === 0 || bMiddle.length === 0
      ? 1
      : bMiddle
          .map((token) => Math.max(...aMiddle.map((other) => givenNameSimilarity(token, other))))
          .reduce((n, s) => n + s, 0) / bMiddle.length;

  const given = first * 0.85 + middle * 0.15;

  // Surname is the gate; given names decide how confident we are.
  return round(surname * 0.45 + given * 0.55);
}

function givenNameSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  // A middle initial against a full middle name is weak evidence, not a clash.
  if (a.length === 1 || b.length === 1) return a[0] === b[0] ? 0.7 : 0;
  return jaroWinkler(a, b);
}

function compareAge(field: string, listingValue: string, profile: Profile, now: number): Candidate | undefined {
  const listed = parseAge(listingValue);
  if (listed === undefined || !profile.dob) return undefined;
  const actual = ageFromDob(profile.dob, now);
  if (actual === undefined) return undefined;

  const delta = Math.abs(actual - listed);
  // Brokers' ages are stale and often rounded; ±1 year is agreement.
  const similarity = delta <= 1 ? 1 : delta === 2 ? 0.6 : delta <= 4 ? 0.2 : 0;
  return { field, profileValue: String(actual), listingValue, similarity };
}

export type MatchBucket = 'auto_confirm' | 'review' | 'discard';

/**
 * Sorts a score into a bucket. `auto_confirm` additionally requires the
 * member to have opted in via their own threshold — the default is that a
 * human confirms every listing before anything is submitted.
 */
export function bucketFor(
  result: MatchResult,
  thresholds: { review: number; auto_confirm: number },
  memberAutoConfirmThreshold: number,
): MatchBucket {
  if (result.score < thresholds.review) return 'discard';
  if (result.requiresManualConfirmation) return 'review';
  if (result.score >= Math.max(thresholds.auto_confirm, memberAutoConfirmThreshold)) return 'auto_confirm';
  return 'review';
}
