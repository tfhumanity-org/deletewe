import type { HTMLElement } from 'node-html-parser';
import { EngineError, type BrowserDriver, type ElementSnapshot, type NavigateOptions, type PageHandle } from '@deletewe/engine';
import { describeForm, formFor, hostAllowed, parseDocument, queryAll, selectWithin, toSnapshot } from './dom.ts';

export interface FixtureRoute {
  /** Exact URL, or a prefix ending in `*`. */
  readonly url: string;
  readonly html: string;
  readonly status?: number;
  /** Where a form submission from this page lands. */
  readonly submitsTo?: string;
}

export interface SubmissionRecord {
  readonly url: string;
  readonly fields: Record<string, string>;
}

/**
 * Serves recorded HTML instead of making requests.
 *
 * This is what keeps live broker traffic out of CI: broker definitions are
 * exercised against recorded fixtures through the real scan, match, and submit
 * code paths. See docs/broker-catalog.md section 5.
 */
export class FixtureBrowserDriver implements BrowserDriver {
  readonly kind = 'fixture';
  readonly canScreenshot = true;
  /** Every form submission the definition performed, for assertions. */
  readonly submissions: SubmissionRecord[] = [];
  readonly visited: string[] = [];

  private routes: readonly FixtureRoute[];

  constructor(routes: readonly FixtureRoute[]) {
    this.routes = routes;
  }

  /** Swaps the recorded pages, so a test can simulate a broker changing. */
  setRoutes(routes: readonly FixtureRoute[]): void {
    this.routes = routes;
  }

  async open(url: string, options: NavigateOptions): Promise<PageHandle> {
    if (!hostAllowed(url, options.allowedHosts)) {
      throw new EngineError('host_not_allowlisted', 'navigation blocked: host is not on the definition allowlist');
    }
    const page = new FixturePage(this, options);
    await page.goto(url);
    return page;
  }

  resolve(url: string): FixtureRoute | undefined {
    const exact = this.routes.find((r) => r.url === url);
    if (exact) return exact;
    return this.routes.find((r) => r.url.endsWith('*') && url.startsWith(r.url.slice(0, -1)));
  }
}

class FixturePage implements PageHandle {
  private currentUrl = '';
  private currentStatus = 200;
  private html = '';
  private root: HTMLElement = parseDocument('');
  private readonly overrides = new Map<string, string>();

  constructor(
    private readonly driver: FixtureBrowserDriver,
    private readonly options: NavigateOptions,
  ) {}

  async goto(url: string): Promise<void> {
    if (!hostAllowed(url, this.options.allowedHosts)) {
      throw new EngineError('host_not_allowlisted', 'navigation blocked: host is not on the definition allowlist');
    }
    const route = this.driver.resolve(url);
    if (!route) throw new EngineError('not_found', `no fixture recorded for ${url}`);
    this.driver.visited.push(url);
    this.currentUrl = url;
    this.currentStatus = route.status ?? 200;
    this.html = route.html;
    this.root = parseDocument(route.html);
  }

  url(): string { return this.currentUrl; }
  status(): number { return this.currentStatus; }
  async content(): Promise<string> { return this.html; }
  async text(): Promise<string> { return this.root.text ?? ''; }

  async querySelector(selector: string): Promise<ElementSnapshot | null> {
    const element = selectWithin(this.root, selector);
    return element ? toSnapshot(element) : null;
  }

  async queryAll(selector: string): Promise<ElementSnapshot[]> {
    return queryAll(this.root, selector).map(toSnapshot);
  }

  async fill(selector: string, value: string): Promise<void> {
    const element = selectWithin(this.root, selector);
    if (!element) throw new EngineError('selector_missing', 'no element matched selector');
    const name = element.getAttribute('name') ?? selector;
    this.overrides.set(name, value);
  }

  async select(selector: string, value: string): Promise<void> {
    await this.fill(selector, value);
  }

  async click(selector: string): Promise<void> {
    const form = formFor(this.root, selector);
    if (!form) return;

    const descriptor = describeForm(form, this.currentUrl);
    const fields: Record<string, string> = {};
    for (const field of descriptor.fields) fields[field.name] = this.overrides.get(field.name) ?? field.value;
    for (const [name, value] of this.overrides) fields[name] ??= value;

    this.driver.submissions.push({ url: descriptor.action, fields });

    const route = this.driver.resolve(this.currentUrl);
    if (route?.submitsTo) await this.goto(route.submitsTo);
    this.overrides.clear();
  }

  async waitFor(selector: string | undefined): Promise<void> {
    if (!selector) return;
    if (!selectWithin(this.root, selector)) throw new EngineError('selector_missing', 'expected selector not present');
  }

  async screenshot(): Promise<Uint8Array> {
    // A deterministic stand-in: the evidence pipeline only needs bytes.
    return new TextEncoder().encode(`fixture-screenshot:${this.currentUrl}`);
  }

  async close(): Promise<void> { /* nothing to release */ }
}
