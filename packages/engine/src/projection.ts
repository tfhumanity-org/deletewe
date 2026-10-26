import type { ProfileField } from '@deletewe/schema';
import { EngineError } from './errors.ts';
import { ageFromDob, nameSlug } from './normalise.ts';
import type { Listing, Profile } from './types.ts';

/**
 * The minimum-necessary-disclosure control.
 *
 * A broker definition declares `required_fields`; the submitter is handed a
 * projection containing exactly those fields and nothing else. It is not a
 * filtered view of the profile — the other values are never placed in the
 * object, so a template bug or a malicious definition cannot reach them.
 *
 * See docs/product-spec.md principle 5 and docs/threat-model.md TB4.
 */
export type FieldProjection = Readonly<Partial<Record<ProfileField, string>>>;

export interface ProjectionContext {
  readonly profile: Profile;
  readonly listing?: Pick<Listing, 'url'>;
  readonly now: number;
}

// eslint-disable-next-line complexity
function resolveField(field: ProfileField, ctx: ProjectionContext): string | undefined {
  const { profile } = ctx;
  const name = profile.names[0];
  const address = profile.addresses.find((a) => a.isCurrent)?.address ?? profile.addresses[0]?.address;

  switch (field) {
    case 'full_name':
      return name ? [name.first, name.middle, name.last].filter(Boolean).join(' ') : undefined;
    case 'first_name':
      return name?.first;
    case 'middle_name':
      return name?.middle;
    case 'last_name':
      return name?.last;
    case 'aliases':
      return profile.aliases.length > 0
        ? profile.aliases.map((a) => [a.first, a.middle, a.last].filter(Boolean).join(' ')).join(', ')
        : undefined;
    case 'email':
      return profile.emails[0];
    case 'phone':
      return profile.phones[0];
    case 'address':
      return address ? [address.line1, address.line2].filter(Boolean).join(', ') : undefined;
    case 'city':
      return address?.city;
    case 'region':
      return address?.region;
    case 'postal_code':
      return address?.postalCode;
    case 'country':
      return address?.country;
    case 'dob':
      return profile.dob;
    case 'age': {
      const age = profile.dob ? ageFromDob(profile.dob, ctx.now) : undefined;
      return age === undefined ? undefined : String(age);
    }
    case 'listing_url':
      return ctx.listing?.url;
    case 'jurisdiction':
      return profile.jurisdiction;
  }
}

/** Builds the projection. Missing values are omitted, not blanked. */
export function project(fields: readonly ProfileField[], ctx: ProjectionContext): FieldProjection {
  const out: Partial<Record<ProfileField, string>> = {};
  for (const field of fields) {
    const value = resolveField(field, ctx);
    if (value !== undefined && value.trim().length > 0) out[field] = value.trim();
  }
  return out;
}

/** Declared fields the profile cannot supply. Used to block a submission early. */
export function missingFields(fields: readonly ProfileField[], projection: FieldProjection): ProfileField[] {
  return fields.filter((f) => projection[f] === undefined);
}

const PLACEHOLDER = /\{\{\s*([a-z_]+)\s*\}\}/g;
/** C0 and C1 control characters, stripped so a value cannot inject mail headers. */
const CONTROL_CHARS = new RegExp('[\\u0000-\\u001f\\u007f-\\u009f]', 'g');

/**
 * Renders `{{field}}` placeholders from a projection.
 *
 * Throws on any field the projection does not carry, so a definition cannot
 * silently emit an empty value where a name should be, and cannot reach a
 * field it failed to declare.
 */
export function render(template: string, projection: FieldProjection): string {
  return template.replace(PLACEHOLDER, (_match, rawField: string) => {
    const value = projection[rawField as ProfileField];
    if (value === undefined) {
      throw new EngineError('template_field_missing', `template referenced unavailable field "${rawField}"`, {
        field: rawField,
      });
    }
    return value.replace(CONTROL_CHARS, '');
  });
}

/** Expands a broker's `search.url_template`. Values are URL-encoded. */
export function renderSearchUrl(template: string, profile: Profile): string {
  const name = profile.names[0];
  if (!name) throw new EngineError('invalid_input', 'profile has no name to search with');
  const address = profile.addresses.find((a) => a.isCurrent)?.address ?? profile.addresses[0]?.address;

  const values: Record<string, string> = {
    name_slug: nameSlug(name.first, name.last),
    first_name: name.first,
    last_name: name.last,
    city: address?.city ?? '',
    region: address?.region ?? '',
  };

  return template.replace(/\{([a-z_]+)\}/g, (_m, key: string) => {
    const value = values[key];
    if (value === undefined) {
      throw new EngineError('template_field_missing', `search template referenced unknown token "${key}"`, { token: key });
    }
    return encodeURIComponent(value);
  });
}
