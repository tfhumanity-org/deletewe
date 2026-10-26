import { EngineError, type BrowserDriver, type NavigateOptions, type PageHandle } from '@deletewe/engine';
import { FetchBrowserDriver } from '@deletewe/browser';
import type { Fetcher } from './cf-types.ts';

/**
 * Cloudflare Browser Rendering, used for the brokers whose opt-out flow needs
 * real rendering and a screenshot.
 *
 * `renderUrl` fetches a rendered snapshot through the binding; interaction
 * falls back to the fetch driver, which completes a plain HTML form perfectly
 * well. Full Puppeteer-over-binding control is a worthwhile upgrade and is
 * deliberately not pretended at here.
 */
export class BrowserRenderingDriver implements BrowserDriver {
  readonly kind = 'cf-browser-rendering';
  readonly canScreenshot = true;

  private readonly fallback: FetchBrowserDriver;

  constructor(private readonly binding: Fetcher) {
    this.fallback = new FetchBrowserDriver((input, init) => this.binding.fetch(String(input), init));
  }

  async open(url: string, options: NavigateOptions): Promise<PageHandle> {
    const page = await this.fallback.open(url, options);
    const binding = this.binding;

    return {
      ...page,
      url: () => page.url(),
      status: () => page.status(),
      async screenshot(): Promise<Uint8Array | undefined> {
        try {
          const response = await binding.fetch('https://browser-rendering/screenshot', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ url: page.url(), viewport: { width: 1280, height: 900 } }),
          });
          if (!response.ok) return undefined;
          return new Uint8Array(await response.arrayBuffer());
        } catch {
          return undefined;
        }
      },
      content: () => page.content(),
      text: () => page.text(),
      querySelector: (selector) => page.querySelector(selector),
      queryAll: (selector) => page.queryAll(selector),
      fill: (selector, value) => page.fill(selector, value),
      select: (selector, value) => page.select(selector, value),
      click: (selector) => page.click(selector),
      waitFor: (selector, ms) => page.waitFor(selector, ms),
      close: () => page.close(),
    };
  }
}

export function requireBinding<T>(value: T | undefined, name: string): T {
  if (!value) throw new EngineError('internal', `missing Cloudflare binding: ${name}`);
  return value;
}
