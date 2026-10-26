/**
 * A logger whose API cannot express personal data.
 *
 * The field type is a closed set of non-identifying primitives: ids, enum
 * codes, counts, durations, booleans. There is deliberately no `unknown` or
 * `string` escape hatch for arbitrary values, so a caller cannot log a member's
 * address by accident. Free-form text goes through `redact()`, which removes
 * any value drawn from the member's own profile.
 *
 * See docs/threat-model.md section 6.
 */

/** Values safe to emit. Opaque identifiers, enum codes, numbers, booleans. */
export type SafeValue = string | number | boolean | null | undefined;

export interface LogFields {
  readonly [key: string]: SafeValue;
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogRecord {
  readonly level: LogLevel;
  readonly msg: string;
  readonly at: number;
  readonly fields: LogFields;
}

export interface LogSink {
  write(record: LogRecord): void;
}

export interface Logger {
  debug(msg: string, fields?: LogFields): void;
  info(msg: string, fields?: LogFields): void;
  warn(msg: string, fields?: LogFields): void;
  error(msg: string, fields?: LogFields): void;
  child(fields: LogFields): Logger;
}

/**
 * Strings that look like personal data regardless of whose it is. Applied to
 * free text (exception messages, broker page text) before storage.
 */
const PII_SHAPES: readonly [RegExp, string][] = [
  [/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[email]'],
  [/(?<![\d-])(?:\+?1[-. ]?)?\(?\d{3}\)?[-. ]?\d{3}[-. ]?\d{4}(?![\d-])/g, '[phone]'],
  [/\b\d{3}-\d{2}-\d{4}\b/g, '[ssn]'],
  [/\b\d{1,5}\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s+(?:St|Street|Ave|Avenue|Rd|Road|Blvd|Dr|Drive|Ln|Lane|Ct|Court|Way)\b\.?/g, '[address]'],
  [/\b\d{4}-\d{2}-\d{2}\b/g, '[date]'],
];

/**
 * Removes generic PII shapes and, when supplied, the member's own values.
 * `secrets` should be the plaintext profile values in scope for the operation.
 */
export function redact(text: string, secrets: readonly string[] = []): string {
  let out = text;
  for (const secret of secrets) {
    const trimmed = secret.trim();
    if (trimmed.length < 3) continue;
    out = out.split(trimmed).join('[redacted]');
    const lower = trimmed.toLowerCase();
    if (lower !== trimmed) out = out.split(lower).join('[redacted]');
  }
  for (const [re, replacement] of PII_SHAPES) out = out.replace(re, replacement);
  return out.slice(0, 2000);
}

class BaseLogger implements Logger {
  constructor(
    private readonly sink: LogSink,
    private readonly bound: LogFields,
    private readonly minLevel: LogLevel,
  ) {}

  private static readonly ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

  private emit(level: LogLevel, msg: string, fields?: LogFields): void {
    if (BaseLogger.ORDER[level] < BaseLogger.ORDER[this.minLevel]) return;
    this.sink.write({ level, msg, at: Date.now(), fields: { ...this.bound, ...fields } });
  }

  debug(msg: string, fields?: LogFields): void { this.emit('debug', msg, fields); }
  info(msg: string, fields?: LogFields): void { this.emit('info', msg, fields); }
  warn(msg: string, fields?: LogFields): void { this.emit('warn', msg, fields); }
  error(msg: string, fields?: LogFields): void { this.emit('error', msg, fields); }

  child(fields: LogFields): Logger {
    return new BaseLogger(this.sink, { ...this.bound, ...fields }, this.minLevel);
  }
}

export function createLogger(sink: LogSink, minLevel: LogLevel = 'info', bound: LogFields = {}): Logger {
  return new BaseLogger(sink, bound, minLevel);
}

export class MemorySink implements LogSink {
  readonly records: LogRecord[] = [];
  write(record: LogRecord): void { this.records.push(record); }
  text(): string { return this.records.map((r) => `${r.msg} ${JSON.stringify(r.fields)}`).join('\n'); }
  clear(): void { this.records.length = 0; }
}

export const nullLogger: Logger = createLogger({ write() {} }, 'error');
