import type { HTMLElement } from 'node-html-parser';
import { EngineError, type BrowserDriver, type ElementSnapshot, type NavigateOptions, type PageHandle } from '@deletewe/engine';
import { describeForm, formFor, hostAllowed, parseDocument, queryAll, selectWithin, toSnapshot } from './dom.ts';

/**
 * A browser driver built on `fetch` and a pure-JS DOM.
 *
 * Most data-broker opt-out forms are ordinary HTML forms, so a fetch-and-post
 * driver completes them without a headless browser. It runs identically on
 * Workers and Node, needs no binaries, and is the default everywhere; the
 * Browser Rendering and Playwright drivers are upgrades for sites that need
 * real rendering.
 *
 * It cannot screenshot. `canScreenshot` is false, and the evidence pipeline
 * records a DOM snapshot and transcript instead of pretending otherwise.
 */
export class FetchBrowserDriver implements BrowserDriver {
  readonly kind = 'fetch';
  readonly canScreenshot = false;

  constructor(private readonly fetchImpl: typeof fetch = fetch) {}

  async open(url: string, options: NavigateOptions): Promise<PageHandle> {
    if (!hostAllowed(url, options.allowedHosts)) {
      throw new EngineError('host_not_allowlisted', 'navigation blocked: host is not on the definition allowlist');
    }
    const page = new FetchPage(this.fetchImpl, options);
    await page.goto(url);
    return page;
  }
}

class FetchPage implements PageHandle {
  private currentUrl = '';
  private currentStatus = 0;
  private html = '';
  private root: HTMLElement;
  /** Values queued by `fill`/`select`, applied when a form is submitted. */
  private readonly overrides = new Map<string, string>();

  constructor(
    private readonly fetchImpl: typeof fetch,
    private readonly options: NavigateOptions,
  ) {
    this.root = parseDocument('');
  }

  async goto(url: string): Promise<void> {
    if (!hostAllowed(url, this.options.allowedHosts)) {
      throw new EngineError('host_not_allowlisted', 'navigation blocked: host is not on the definition allowlist');
    }
    const response = await this.request(url, { method: 'GET' });
    await this.absorb(response, url);
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
    if (!element) throw new EngineError('selector_missing', `no element matched selector`);
    const name = element.getAttribute('name');
    if (!name) throw new EngineError('selector_missing', 'matched element has no name attribute to submit');
    this.overrides.set(name, value);
  }

  async select(selector: string, value: string): Promise<void> {
    await this.fill(selector, value);
  }

  /**
   * Submitting is the only navigation a click can cause here. A click on
   * anything that is not inside a form is a no-op rather than an error: many
   * definitions click a disclosure toggle before filling the real form.
   */
  async click(selector: string): Promise<void> {
    const form = formFor(this.root, selector);
    if (!form) return;

    const descriptor = describeForm(form, this.currentUrl);
    const body = new URLSearchParams();
    for (const field of descriptor.fields) {
      body.set(field.name, this.overrides.get(field.name) ?? field.value);
    }
    for (const [name, value] of this.overrides) if (!body.has(name)) body.set(name, value);

    const submitName = selectWithin(this.root, selector)?.getAttribute('name');
    const submitValue = selectWithin(this.root, selector)?.getAttribute('value');
    if (submitName && submitValue !== undefined && submitValue !== null) body.set(submitName, submitValue);

    if (descriptor.method === 'GET') {
      const target = new URL(descriptor.action);
      for (const [k, v] of body) target.searchParams.set(k, v);
      await this.goto(target.toString());
      return;
    }

    if (!hostAllowed(descriptor.action, this.options.allowedHosts)) {
      throw new EngineError('host_not_allowlisted', 'form posts to a host outside the definition allowlist');
    }
    const response = await this.request(descriptor.action, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    await this.absorb(response, descriptor.action);
    this.overrides.clear();
  }

  /** No live DOM to wait on; a selector check is the meaningful assertion. */
  async waitFor(selector: string | undefined): Promise<void> {
    if (!selector) return;
    if (!selectWithin(this.root, selector)) {
      throw new EngineError('selector_missing', 'expected selector not present');
    }
  }

  async screenshot(): Promise<undefined> { return undefined; }
  async close(): Promise<void> { /* nothing to release */ }

  private async request(url: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => { controller.abort(); }, this.options.timeoutMs);
    try {
      return await this.fetchImpl(url, {
        ...init,
        redirect: 'follow',
        signal: controller.signal,
        headers: { 'user-agent': this.options.userAgent, accept: 'text/html,application/xhtml+xml', ...init.headers },
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new EngineError('timeout', 'request timed out');
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  private async absorb(response: Response, requestedUrl: string): Promise<void> {
    // `response.url` is the post-redirect URL, but it is empty on a synthetic
    // Response, so fall back to what we asked for rather than to ''.
    const landedOn = response.url || requestedUrl;
    // A redirect chain must not walk us off the allowlist.
    if (!hostAllowed(landedOn, this.options.allowedHosts)) {
      throw new EngineError('host_not_allowlisted', 'response redirected off the definition allowlist');
    }
    this.currentUrl = landedOn;
    this.currentStatus = response.status;
    this.html = await response.text();
    this.root = parseDocument(this.html);
  }
}
