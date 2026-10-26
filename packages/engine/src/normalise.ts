/** Pure normalisation helpers shared by the matcher and the blind index. */

const NICKNAMES: Readonly<Record<string, string>> = {
  bill: 'william', billy: 'william', will: 'william', willie: 'william',
  bob: 'robert', bobby: 'robert', rob: 'robert', robbie: 'robert',
  dick: 'richard', rick: 'richard', ricky: 'richard', rich: 'richard',
  jim: 'james', jimmy: 'james', jamie: 'james',
  joe: 'joseph', joey: 'joseph',
  jack: 'john', johnny: 'john', jon: 'john',
  mike: 'michael', mickey: 'michael', mick: 'michael',
  tom: 'thomas', tommy: 'thomas',
  tony: 'anthony',
  chris: 'christopher', kit: 'christopher',
  dave: 'david', davy: 'david',
  dan: 'daniel', danny: 'daniel',
  matt: 'matthew', nick: 'nicholas', steve: 'steven', stephen: 'steven',
  ed: 'edward', eddie: 'edward', ted: 'edward', teddy: 'edward',
  sam: 'samuel', ben: 'benjamin', andy: 'andrew', drew: 'andrew',
  kate: 'katherine', katie: 'katherine', kathy: 'katherine', cathy: 'katherine', catherine: 'katherine',
  liz: 'elizabeth', beth: 'elizabeth', betty: 'elizabeth', eliza: 'elizabeth', lizzie: 'elizabeth',
  sue: 'susan', susie: 'susan',
  peggy: 'margaret', maggie: 'margaret', meg: 'margaret', margie: 'margaret',
  jen: 'jennifer', jenny: 'jennifer',
  becky: 'rebecca', becca: 'rebecca',
  trish: 'patricia', patty: 'patricia', pat: 'patricia',
  debbie: 'deborah', deb: 'deborah',
  cindy: 'cynthia', sandy: 'sandra', barb: 'barbara', barbie: 'barbara',
  nancy: 'ann', nan: 'ann', annie: 'ann', anne: 'ann', anna: 'ann',
  jess: 'jessica', jessie: 'jessica',
  abby: 'abigail', allie: 'alison', ally: 'alison',
  alex: 'alexander', alexandra: 'alexander', sasha: 'alexander',
};

const SUFFIXES = new Set(['jr', 'sr', 'ii', 'iii', 'iv', 'v', 'phd', 'md', 'esq', 'dds']);
const PREFIXES = new Set(['mr', 'mrs', 'ms', 'miss', 'dr', 'prof', 'rev', 'sir', 'mx']);

const COMBINING_MARKS = new RegExp('[\\u0300-\\u036f]', 'g');

export function normaliseText(value: string): string {
  return value
    .normalize('NFKD')
    // Strip combining marks so "José" and "Jose" compare equal.
    .replace(COMBINING_MARKS, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Tokenises a free-form name, dropping titles and suffixes. */
export function nameTokens(value: string): string[] {
  return normaliseText(value)
    .split(/[\s-]+/)
    .filter((t) => t.length > 0 && !SUFFIXES.has(t) && !PREFIXES.has(t));
}

/** Maps a known diminutive to its formal root so "Bill" matches "William". */
export function canonicalGivenName(token: string): string {
  return NICKNAMES[token] ?? token;
}

/** E.164-ish: digits only, with a leading US country code dropped. */
export function normalisePhone(value: string): string {
  const digits = value.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) return digits.slice(1);
  return digits;
}

export function normaliseEmail(value: string): string {
  return value.trim().toLowerCase();
}

const STREET_TYPES: Readonly<Record<string, string>> = {
  street: 'st', str: 'st', st: 'st',
  avenue: 'ave', av: 'ave', ave: 'ave',
  road: 'rd', rd: 'rd',
  boulevard: 'blvd', blvd: 'blvd',
  drive: 'dr', dr: 'dr',
  lane: 'ln', ln: 'ln',
  court: 'ct', ct: 'ct',
  place: 'pl', pl: 'pl',
  terrace: 'ter', ter: 'ter',
  parkway: 'pkwy', pkwy: 'pkwy',
  circle: 'cir', cir: 'cir',
  highway: 'hwy', hwy: 'hwy',
  north: 'n', south: 's', east: 'e', west: 'w',
  northeast: 'ne', northwest: 'nw', southeast: 'se', southwest: 'sw',
  apartment: 'apt', apt: 'apt', suite: 'ste', ste: 'ste', unit: 'unit',
};

/** USPS-ish street normalisation: enough to compare, not enough to deliver. */
export function normaliseStreet(value: string): string {
  return normaliseText(value)
    .split(' ')
    .map((t) => STREET_TYPES[t] ?? t)
    .join(' ')
    .trim();
}

const US_STATES: Readonly<Record<string, string>> = {
  alabama: 'al', alaska: 'ak', arizona: 'az', arkansas: 'ar', california: 'ca',
  colorado: 'co', connecticut: 'ct', delaware: 'de', florida: 'fl', georgia: 'ga',
  hawaii: 'hi', idaho: 'id', illinois: 'il', indiana: 'in', iowa: 'ia',
  kansas: 'ks', kentucky: 'ky', louisiana: 'la', maine: 'me', maryland: 'md',
  massachusetts: 'ma', michigan: 'mi', minnesota: 'mn', mississippi: 'ms', missouri: 'mo',
  montana: 'mt', nebraska: 'ne', nevada: 'nv', 'new hampshire': 'nh', 'new jersey': 'nj',
  'new mexico': 'nm', 'new york': 'ny', 'north carolina': 'nc', 'north dakota': 'nd', ohio: 'oh',
  oklahoma: 'ok', oregon: 'or', pennsylvania: 'pa', 'rhode island': 'ri', 'south carolina': 'sc',
  'south dakota': 'sd', tennessee: 'tn', texas: 'tx', utah: 'ut', vermont: 'vt',
  virginia: 'va', washington: 'wa', 'west virginia': 'wv', wisconsin: 'wi', wyoming: 'wy',
  'district of columbia': 'dc',
};

export function normaliseRegion(value: string): string {
  const t = normaliseText(value);
  return US_STATES[t] ?? t;
}

export function normalisePostalCode(value: string): string {
  const digits = value.replace(/\D/g, '');
  // Compare on the 5-digit prefix; ZIP+4 differences are not a mismatch.
  return digits.slice(0, 5);
}

/** Parses the integer age out of strings like "Age 47", "47 years old", "47". */
export function parseAge(value: string): number | undefined {
  const m = /(\d{1,3})/.exec(value);
  if (!m?.[1]) return undefined;
  const n = Number.parseInt(m[1], 10);
  return n >= 0 && n <= 130 ? n : undefined;
}

export function ageFromDob(dob: string, now: number): number | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dob.trim());
  if (!m) return undefined;
  const birth = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (Number.isNaN(birth)) return undefined;
  const years = (now - birth) / (365.2425 * 24 * 60 * 60 * 1000);
  return years >= 0 && years <= 130 ? Math.floor(years) : undefined;
}

/** URL-safe slug for a broker's `{name_slug}` search template. */
export function nameSlug(first: string, last: string): string {
  return [first, last].map((p) => normaliseText(p).replace(/\s+/g, '-')).filter(Boolean).join('-');
}
