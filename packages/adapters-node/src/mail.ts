import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { InboundMail, InboundMessage, Mailer, OutboundMessage } from '@deletewe/engine';

/**
 * Writes outbound mail to a directory instead of sending it.
 *
 * This is the default for self-hosting and for tests. A self-hoster can read
 * exactly what would be sent before wiring up a real provider, which is a
 * reasonable thing to want from software that writes letters in your name.
 */
export class OutboxMailer implements Mailer {
  readonly sent: OutboundMessage[] = [];

  constructor(private readonly dir?: string) {}

  async send(message: OutboundMessage): Promise<void> {
    this.sent.push(message);
    if (!this.dir) return;
    await mkdir(this.dir, { recursive: true });
    const name = `${String(Date.now())}-${message.to.replace(/[^a-z0-9]/gi, '_')}.eml`;
    await writeFile(join(this.dir, name), serialise(message), 'utf8');
  }
}

/**
 * Posts to a provider's HTTP send API. Shape matches the common
 * `{ from, to, subject, text }` JSON contract; only `fetch` is required, so it
 * runs on Workers and Node alike.
 */
export class HttpApiMailer implements Mailer {
  constructor(
    private readonly endpoint: string,
    private readonly apiKey: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async send(message: OutboundMessage): Promise<void> {
    const response = await this.fetchImpl(this.endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({
        from: message.from,
        to: [message.to],
        cc: message.cc,
        reply_to: message.replyTo,
        subject: message.subject,
        text: message.text,
      }),
    });
    if (!response.ok) {
      throw new Error(`mail provider returned ${String(response.status)}`);
    }
  }
}

export function serialise(message: OutboundMessage): string {
  return [
    `From: ${message.from}`,
    `To: ${message.to}`,
    ...(message.cc?.length ? [`Cc: ${message.cc.join(', ')}`] : []),
    `Reply-To: ${message.replyTo}`,
    `Subject: ${message.subject}`,
    'Content-Type: text/plain; charset=utf-8',
    '',
    message.text,
  ].join('\n');
}

/**
 * Per-job inbound addressing.
 *
 * Each submission gets its own high-entropy address, so an arriving message
 * identifies exactly one job and cannot be redirected at another.
 * See docs/threat-model.md TB6.
 */
export class PlusAddressInbound implements InboundMail {
  constructor(
    private readonly localPart: string,
    private readonly domain: string,
  ) {}

  addressFor(token: string): string {
    return `${this.localPart}+${token}@${this.domain}`;
  }

  tokenFrom(address: string): string | undefined {
    // A `To:` header normally carries a display name: `deletewe <optout+x@...>`.
    // Match the addr-spec, not the whole header.
    const normalised = address.trim().toLowerCase();
    const bare = /<([^>]+)>/.exec(normalised)?.[1]?.trim() ?? normalised;
    const match = new RegExp(`^${escapeRegex(this.localPart)}\\+([a-z0-9]+)@${escapeRegex(this.domain)}$`, 'i').exec(
      bare,
    );
    return match?.[1];
  }
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Minimal RFC 5322 reader: headers, then body, with quoted-printable decoding
 * and the first text/plain part of a multipart message. Enough to find a
 * confirmation link, with no dependency in the path that handles PII.
 */
export function parseEmail(raw: string, receivedAt: number): InboundMessage {
  const normalised = raw.replace(/\r\n/g, '\n');
  const split = normalised.indexOf('\n\n');
  const headerBlock = split === -1 ? normalised : normalised.slice(0, split);
  let body = split === -1 ? '' : normalised.slice(split + 2);

  const headers = new Map<string, string>();
  // Unfold continuation lines before parsing.
  for (const line of headerBlock.replace(/\n[ \t]+/g, ' ').split('\n')) {
    const colon = line.indexOf(':');
    if (colon === -1) continue;
    const name = line.slice(0, colon).trim().toLowerCase();
    // First occurrence wins. Receiving infrastructure prepends its headers, so
    // a sender who appends their own Authentication-Results must not be able
    // to overwrite the platform's verdict. See docs/threat-model.md TB6.
    if (headers.has(name)) continue;
    headers.set(name, line.slice(colon + 1).trim());
  }

  const contentType = headers.get('content-type') ?? '';
  const boundary = /boundary="?([^";]+)"?/i.exec(contentType)?.[1];
  if (boundary) {
    for (const part of body.split(`--${boundary}`)) {
      if (!/content-type:\s*text\/plain/i.test(part)) continue;
      const partSplit = part.indexOf('\n\n');
      if (partSplit === -1) continue;
      const partHeaders = part.slice(0, partSplit).toLowerCase();
      body = part.slice(partSplit + 2);
      if (partHeaders.includes('quoted-printable')) body = decodeQuotedPrintable(body);
      break;
    }
  } else if ((headers.get('content-transfer-encoding') ?? '').toLowerCase().includes('quoted-printable')) {
    body = decodeQuotedPrintable(body);
  }

  const authResults = headers.get('authentication-results');
  const authenticated = authResults === undefined ? undefined : !/(spf|dkim)=(fail|softfail|none)/i.test(authResults);

  return {
    to: headers.get('to') ?? '',
    from: headers.get('from') ?? '',
    subject: headers.get('subject') ?? '',
    text: body.trim(),
    raw,
    receivedAt,
    authenticated,
  };
}

export function decodeQuotedPrintable(text: string): string {
  return text
    .replace(/=\n/g, '')
    .replace(/=([0-9A-F]{2})/gi, (_m, hex: string) => String.fromCharCode(Number.parseInt(hex, 16)));
}

/** Reads `.eml` files dropped into a directory. The self-host inbound path. */
export async function readMaildrop(dir: string, now: () => number = Date.now): Promise<InboundMessage[]> {
  let names: string[];
  try {
    names = await readdir(dir);
  } catch {
    return [];
  }
  const out: InboundMessage[] = [];
  for (const name of names.filter((n) => n.endsWith('.eml')).sort()) {
    out.push(parseEmail(await readFile(join(dir, name), 'utf8'), now()));
  }
  return out;
}
