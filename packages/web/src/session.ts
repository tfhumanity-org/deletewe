import type { Context } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { newToken, type Store } from '@deletewe/engine';

export const SESSION_COOKIE = 'dw_session';
export const ADMIN_COOKIE = 'dw_admin';
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

export interface SessionInfo {
  readonly id: string;
  readonly memberId: string | null;
  readonly adminId: string | null;
  readonly csrfToken: string;
}

export async function startSession(
  c: Context,
  store: Store,
  /**
   * `admin` selects the operator cookie even before an operator id exists,
   * so the login form's CSRF token is readable by its own POST handler.
   */
  params: { memberId?: string; adminId?: string; secure: boolean; admin?: boolean },
): Promise<SessionInfo> {
  const csrfToken = newToken(16);
  const id = await store.createSession({
    memberId: params.memberId,
    adminId: params.adminId,
    ttlMs: SESSION_TTL_MS,
    csrfToken,
  });
  setCookie(c, params.adminId ?? params.admin ? ADMIN_COOKIE : SESSION_COOKIE, id, {
    httpOnly: true,
    secure: params.secure,
    sameSite: 'Lax',
    path: '/',
    maxAge: SESSION_TTL_MS / 1000,
  });
  return { id, memberId: params.memberId ?? null, adminId: params.adminId ?? null, csrfToken };
}

export async function readSession(c: Context, store: Store, admin = false): Promise<SessionInfo | undefined> {
  const id = getCookie(c, admin ? ADMIN_COOKIE : SESSION_COOKIE);
  if (!id) return undefined;
  const row = await store.getSession(id);
  if (!row) return undefined;
  return { id, memberId: row.memberId, adminId: row.adminId, csrfToken: row.csrfToken };
}

export async function endSession(c: Context, store: Store, admin = false): Promise<void> {
  const id = getCookie(c, admin ? ADMIN_COOKIE : SESSION_COOKIE);
  if (id) await store.deleteSession(id);
  deleteCookie(c, admin ? ADMIN_COOKIE : SESSION_COOKIE, { path: '/' });
}

/**
 * Constant-time-ish comparison of the submitted CSRF token against the one
 * bound to the session. Every state-changing route checks this.
 */
export function csrfValid(expected: string, submitted: FormDataEntryValue | null | undefined): boolean {
  if (typeof submitted !== 'string' || submitted.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ submitted.charCodeAt(i);
  return diff === 0;
}

/**
 * No inline script, no external origins, nothing that can exfiltrate a page
 * containing a member's dossier. See docs/threat-model.md TB1.
 */
export const CSP =
  "default-src 'none'; " +
  "style-src 'unsafe-inline'; " +
  "img-src 'self' data:; " +
  "form-action 'self'; " +
  "base-uri 'none'; " +
  "frame-ancestors 'none'";

export const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  'content-security-policy': CSP,
  'referrer-policy': 'no-referrer',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'permissions-policy': 'geolocation=(), camera=(), microphone=(), interest-cohort=()',
  'cross-origin-opener-policy': 'same-origin',
};
