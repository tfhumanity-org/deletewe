import type { InboundMail, InboundMessage } from '@deletewe/engine';
import type { ForwardableEmailMessage } from './cf-types.ts';

/** Per-job inbound addressing on an Email Routing catch-all. */
export class EmailRoutingInbound implements InboundMail {
  constructor(
    private readonly localPart: string,
    private readonly domain: string,
  ) {}

  addressFor(token: string): string {
    return `${this.localPart}+${token}@${this.domain}`;
  }

  tokenFrom(address: string): string | undefined {
    const normalised = address.trim().toLowerCase();
    const at = normalised.indexOf('@');
    if (at === -1) return undefined;
    if (normalised.slice(at + 1) !== this.domain.toLowerCase()) return undefined;
    const local = normalised.slice(0, at);
    const plus = local.indexOf('+');
    if (plus === -1 || local.slice(0, plus) !== this.localPart.toLowerCase()) return undefined;
    const token = local.slice(plus + 1);
    return /^[a-z0-9]+$/.test(token) ? token : undefined;
  }
}

/** Reads a Cloudflare Email Routing message into the engine's shape. */
export async function readEmailMessage(
  message: ForwardableEmailMessage,
  parse: (raw: string, receivedAt: number) => InboundMessage,
  now: number,
): Promise<InboundMessage> {
  const chunks: Uint8Array[] = [];
  const reader = message.raw.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const raw = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    raw.set(chunk, offset);
    offset += chunk.length;
  }

  const parsed = parse(new TextDecoder().decode(raw), now);
  // Trust the platform's envelope over the headers, and its auth verdict over ours.
  const authResults = message.headers.get('authentication-results');
  return {
    ...parsed,
    to: message.to,
    from: message.from,
    authenticated: authResults === null ? undefined : !/(spf|dkim)=(fail|softfail|none)/i.test(authResults),
  };
}
