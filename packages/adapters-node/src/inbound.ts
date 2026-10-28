import { mkdir, readdir, readFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import type { InboundMailSource, InboundMessage } from '@deletewe/engine';
import { parseEmail } from './mail.ts';

/**
 * Reads `.eml` files dropped into a directory.
 *
 * The zero-configuration option: point procmail, fetchmail, or a cron'd
 * `curl` at the directory and confirmations start working. Processed files are
 * archived rather than deleted, because a confirmation we failed to parse is
 * exactly the thing an operator will want to look at.
 */
export class MaildropSource implements InboundMailSource {
  readonly kind = 'maildrop';

  constructor(
    private readonly dir: string,
    private readonly now: () => number = Date.now,
  ) {}

  private get archive(): string {
    return join(this.dir, 'processed');
  }

  async collect(limit = 100): Promise<InboundMessage[]> {
    await mkdir(this.archive, { recursive: true });

    // Snapshot the names first and archive only these. Re-reading the
    // directory afterwards would also sweep up anything that arrived while we
    // were working, losing it unprocessed.
    let names: string[];
    try {
      names = (await readdir(this.dir)).filter((n) => n.endsWith('.eml')).sort().slice(0, limit);
    } catch {
      return [];
    }

    const messages: InboundMessage[] = [];
    for (const name of names) {
      const path = join(this.dir, name);
      try {
        messages.push(parseEmail(await readFile(path, 'utf8'), this.now()));
      } catch {
        // Unparseable, but still evidence of something: archive it rather
        // than leaving it to be retried forever.
      }
      await rename(path, join(this.archive, name)).catch(() => undefined);
    }
    return messages;
  }

  async check(): Promise<{ ok: boolean; detail: string }> {
    try {
      await mkdir(this.archive, { recursive: true });
      const waiting = (await readdir(this.dir)).filter((n) => n.endsWith('.eml')).length;
      return { ok: true, detail: `maildrop at ${this.dir}, ${String(waiting)} message(s) waiting` };
    } catch (error) {
      return { ok: false, detail: `cannot read ${this.dir}: ${String(error)}` };
    }
  }
}

// --- IMAP -------------------------------------------------------------------

interface ImapMessage {
  readonly uid: number;
  readonly source?: Buffer;
}

interface ImapLock {
  release(): void;
}

interface ImapClient {
  connect(): Promise<void>;
  logout(): Promise<void>;
  getMailboxLock(path: string): Promise<ImapLock>;
  fetch(range: string | object, query: object): AsyncIterable<ImapMessage>;
  messageFlagsAdd(range: string | object, flags: string[]): Promise<boolean>;
  mailboxOpen(path: string): Promise<{ exists: number }>;
}

export interface ImapOptions {
  readonly host: string;
  readonly port?: number;
  readonly secure?: boolean;
  readonly user: string;
  readonly pass: string;
  readonly mailbox?: string;
  /** Injected in tests; production resolves imapflow. */
  readonly clientFactory?: (options: Record<string, unknown>) => ImapClient;
}

/**
 * Polls an IMAP mailbox for confirmation mail.
 *
 * `imapflow` is an optional dependency, imported at call time, so a
 * self-hoster using the maildrop never pays for it:
 *
 *   npm install imapflow
 *
 * Only unseen messages are collected, and each is marked `\Seen` as it is
 * taken, so a confirmation is acted on once even if two ticks overlap.
 */
export class ImapInboundSource implements InboundMailSource {
  readonly kind = 'imap';

  constructor(
    private readonly options: ImapOptions,
    private readonly now: () => number = Date.now,
  ) {}

  private async client(): Promise<ImapClient> {
    const config = {
      host: this.options.host,
      port: this.options.port ?? 993,
      secure: this.options.secure ?? true,
      auth: { user: this.options.user, pass: this.options.pass },
      logger: false,
    };
    if (this.options.clientFactory) return this.options.clientFactory(config);

    try {
      // Indirect specifier: imapflow is optional, and a literal import would
      // make this package fail to typecheck without it installed.
      const specifier = 'imapflow';
      const mod = (await import(specifier)) as unknown as {
        ImapFlow: new (options: Record<string, unknown>) => ImapClient;
      };
      return new mod.ImapFlow(config);
    } catch (error) {
      if (error instanceof Error && /Cannot find (module|package)/.test(error.message)) {
        throw new Error('IMAP inbound mail needs imapflow installed: npm install imapflow', { cause: error });
      }
      throw error;
    }
  }

  async collect(limit = 50): Promise<InboundMessage[]> {
    const mailbox = this.options.mailbox ?? 'INBOX';
    const client = await this.client();
    await client.connect();

    const lock = await client.getMailboxLock(mailbox);
    const messages: InboundMessage[] = [];
    try {
      for await (const message of client.fetch({ seen: false }, { source: true, uid: true })) {
        if (messages.length >= limit) break;
        if (!message.source) continue;
        try {
          messages.push(parseEmail(message.source.toString('utf8'), this.now()));
        } catch {
          // Leave it unseen: an operator can look at what we could not parse.
          continue;
        }
        // Claim it only once it is safely parsed and in hand.
        await client.messageFlagsAdd({ uid: String(message.uid) }, ['\\Seen']).catch(() => false);
      }
    } finally {
      lock.release();
      await client.logout().catch(() => undefined);
    }
    return messages;
  }

  async check(): Promise<{ ok: boolean; detail: string }> {
    try {
      const client = await this.client();
      await client.connect();
      const mailbox = this.options.mailbox ?? 'INBOX';
      const status = await client.mailboxOpen(mailbox);
      await client.logout().catch(() => undefined);
      return {
        ok: true,
        detail: `connected to ${this.options.host} as ${this.options.user}, ${mailbox} holds ${String(status.exists)} message(s)`,
      };
    } catch (error) {
      return { ok: false, detail: error instanceof Error ? error.message : String(error) };
    }
  }
}

export function inboundSourceFromEnv(
  env: NodeJS.ProcessEnv,
  maildropDir: string,
  now: () => number = Date.now,
): InboundMailSource {
  const host = env['DELETEWE_IMAP_HOST'];
  const user = env['DELETEWE_IMAP_USER'];
  const pass = env['DELETEWE_IMAP_PASSWORD'];

  if (host && user && pass) {
    return new ImapInboundSource(
      {
        host,
        user,
        pass,
        port: env['DELETEWE_IMAP_PORT'] ? Number(env['DELETEWE_IMAP_PORT']) : undefined,
        secure: env['DELETEWE_IMAP_SECURE'] !== 'false',
        mailbox: env['DELETEWE_IMAP_MAILBOX'],
      },
      now,
    );
  }
  return new MaildropSource(maildropDir, now);
}
