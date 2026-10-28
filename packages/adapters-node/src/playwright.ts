import { EngineError, type BrowserDriver, type ElementSnapshot, type NavigateOptions, type PageHandle } from '@deletewe/engine';
import { snapshotFromHtml } from '@deletewe/browser';

/**
 * A real browser, for the brokers whose opt-out flow needs rendering.
 *
 * Playwright is an optional dependency, imported at call time. The default
 * fetch driver completes a plain HTML form perfectly well and needs no
 * binaries, so most deployments never want this — and the Docker image stays
 * small because of it. A self-hoster who needs rendering runs:
 *
 *   npm install playwright && npx playwright install chromium
 *
 * The host allowlist is enforced at the network layer here, not just on
 * navigation. That is stronger than the fetch driver can manage: a rendered
 * page pulls scripts, images and XHR of its own, and none of those may leave
 * the hosts the definition declared.
 */

interface PwRoute {
  request(): { url(): string };
  abort(reason?: string): Promise<void>;
  continue(): Promise<void>;
}

interface PwElement {
  textContent(): Promise<string | null>;
  innerHTML(): Promise<string>;
  getAttribute(name: string): Promise<string | null>;
  evaluate<T>(fn: (el: Element) => T): Promise<T>;
}

interface PwResponse {
  status(): number;
}

interface PwPage {
  goto(url: string, options?: { waitUntil?: string; timeout?: number }): Promise<PwResponse | null>;
  url(): string;
  content(): Promise<string>;
  innerText(selector: string): Promise<string>;
  $(selector: string): Promise<PwElement | null>;
  $$(selector: string): Promise<PwElement[]>;
  fill(selector: string, value: string, options?: { timeout?: number }): Promise<void>;
  selectOption(selector: string, value: string, options?: { timeout?: number }): Promise<unknown>;
  click(selector: string, options?: { timeout?: number }): Promise<void>;
  waitForSelector(selector: string, options?: { timeout?: number }): Promise<unknown>;
  waitForTimeout(ms: number): Promise<void>;
  screenshot(options?: { fullPage?: boolean; type?: string }): Promise<Buffer>;
  route(pattern: string, handler: (route: PwRoute) => void | Promise<void>): Promise<void>;
  setDefaultTimeout(ms: number): void;
  close(): Promise<void>;
}

interface PwContext {
  newPage(): Promise<PwPage>;
  close(): Promise<void>;
}

interface PwBrowser {
  newContext(options?: { userAgent?: string; javaScriptEnabled?: boolean }): Promise<PwContext>;
  close(): Promise<void>;
}

interface PwChromium {
  launch(options?: { headless?: boolean; args?: string[] }): Promise<PwBrowser>;
}

export interface PlaywrightOptions {
  /** Kept false by default: a visible browser is never what a server wants. */
  readonly headless?: boolean;
  /** Injected in tests; production resolves the real package. */
  readonly chromium?: PwChromium;
}

function hostAllowed(url: string, allowedHosts: readonly string[]): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return true; // data:, about:blank
    const host = parsed.hostname.toLowerCase();
    return allowedHosts.some((a) => host === a || host.endsWith(`.${a}`));
  } catch {
    return false;
  }
}

export class PlaywrightBrowserDriver implements BrowserDriver {
  readonly kind = 'playwright';
  readonly canScreenshot = true;

  private browser: PwBrowser | undefined;

  constructor(private readonly options: PlaywrightOptions = {}) {}

  private async chromium(): Promise<PwChromium> {
    if (this.options.chromium) return this.options.chromium;
    try {
      // Indirect specifier: playwright is optional, and a literal import here
      // would make the whole package fail to typecheck without it installed.
      const specifier = 'playwright';
      const mod = (await import(specifier)) as unknown as { chromium: PwChromium };
      return mod.chromium;
    } catch {
      throw new EngineError(
        'internal',
        'the Playwright driver needs playwright installed: npm install playwright && npx playwright install chromium',
      );
    }
  }

  async open(url: string, options: NavigateOptions): Promise<PageHandle> {
    if (!hostAllowed(url, options.allowedHosts)) {
      throw new EngineError('host_not_allowlisted', 'navigation blocked: host is not on the definition allowlist');
    }

    this.browser ??= await (await this.chromium()).launch({
      headless: this.options.headless ?? true,
      args: ['--disable-dev-shm-usage'],
    });

    const context = await this.browser.newContext({ userAgent: options.userAgent });
    const page = await context.newPage();
    page.setDefaultTimeout(options.timeoutMs);

    const blocked: string[] = [];
    // Every subresource the page asks for, not just navigations.
    await page.route('**/*', (route) => {
      const target = route.request().url();
      if (hostAllowed(target, options.allowedHosts)) return route.continue();
      blocked.push(target);
      return route.abort('blockedbyclient');
    });

    const handle = new PlaywrightPage(page, context, options, blocked);
    await handle.goto(url);
    return handle;
  }

  /** Releases the shared browser. Call when the process is shutting down. */
  async dispose(): Promise<void> {
    await this.browser?.close();
    this.browser = undefined;
  }
}

class PlaywrightPage implements PageHandle {
  private currentStatus = 0;

  constructor(
    private readonly page: PwPage,
    private readonly context: PwContext,
    private readonly options: NavigateOptions,
    private readonly blocked: string[],
  ) {}

  async goto(url: string): Promise<void> {
    if (!hostAllowed(url, this.options.allowedHosts)) {
      throw new EngineError('host_not_allowlisted', 'navigation blocked: host is not on the definition allowlist');
    }
    const response = await this.page.goto(url, { waitUntil: 'domcontentloaded', timeout: this.options.timeoutMs });
    this.currentStatus = response?.status() ?? 0;

    // A redirect chain must not land us somewhere the definition never named.
    if (!hostAllowed(this.page.url(), this.options.allowedHosts)) {
      throw new EngineError('host_not_allowlisted', 'page redirected off the definition allowlist');
    }
  }

  url(): string { return this.page.url(); }
  status(): number { return this.currentStatus; }
  async content(): Promise<string> { return this.page.content(); }

  async text(): Promise<string> {
    try {
      return await this.page.innerText('body');
    } catch {
      return '';
    }
  }

  /** Subresources refused by the allowlist, for the evidence transcript. */
  blockedRequests(): readonly string[] { return this.blocked; }

  async querySelector(selector: string): Promise<ElementSnapshot | null> {
    const element = await this.page.$(selector);
    return element ? snapshot(element) : null;
  }

  async queryAll(selector: string): Promise<ElementSnapshot[]> {
    const elements = await this.page.$$(selector);
    return Promise.all(elements.map(snapshot));
  }

  async fill(selector: string, value: string): Promise<void> {
    try {
      await this.page.fill(selector, value, { timeout: this.options.timeoutMs });
    } catch (error) {
      throw translate(error, 'selector_missing');
    }
  }

  async select(selector: string, value: string): Promise<void> {
    try {
      await this.page.selectOption(selector, value, { timeout: this.options.timeoutMs });
    } catch (error) {
      throw translate(error, 'selector_missing');
    }
  }

  async click(selector: string): Promise<void> {
    try {
      await this.page.click(selector, { timeout: this.options.timeoutMs });
    } catch (error) {
      throw translate(error, 'selector_missing');
    }
    if (!hostAllowed(this.page.url(), this.options.allowedHosts)) {
      throw new EngineError('host_not_allowlisted', 'a click navigated off the definition allowlist');
    }
  }

  async waitFor(selector: string | undefined, ms: number | undefined): Promise<void> {
    if (selector) {
      try {
        await this.page.waitForSelector(selector, { timeout: ms ?? this.options.timeoutMs });
      } catch (error) {
        throw translate(error, 'selector_missing');
      }
      return;
    }
    if (ms) await this.page.waitForTimeout(ms);
  }

  async screenshot(): Promise<Uint8Array | undefined> {
    try {
      return new Uint8Array(await this.page.screenshot({ fullPage: true, type: 'png' }));
    } catch {
      return undefined;
    }
  }

  async close(): Promise<void> {
    await this.page.close().catch(() => undefined);
    await this.context.close().catch(() => undefined);
  }
}

async function snapshot(element: PwElement): Promise<ElementSnapshot> {
  // Take the element as the browser rendered it — after scripts have run —
  // then query within it locally, so extraction behaves exactly as it does
  // against a recorded fixture.
  // A real function, not a string: Playwright evaluates a string as an
  // expression rather than applying it to the handle, which silently yields
  // undefined.
  const outerHtml = await element.evaluate<string>((el) => el.outerHTML);
  return snapshotFromHtml(outerHtml);
}

function translate(error: unknown, fallback: 'selector_missing' | 'timeout'): EngineError {
  const message = error instanceof Error ? error.message : String(error);
  if (/timeout/i.test(message)) return new EngineError('timeout', 'the page did not respond in time');
  return new EngineError(fallback, 'expected element was not present');
}
