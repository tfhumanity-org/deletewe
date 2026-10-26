import { EngineError, type BrowserDriver, type NavigateOptions, type PageHandle } from '@deletewe/engine';

/**
 * Optional upgrade over the default fetch driver, for brokers whose opt-out
 * flow genuinely needs rendering. Playwright is not a dependency of this
 * package: it is imported at call time, and the error says what to install.
 *
 * It is not the default because most opt-out forms are plain HTML forms, and
 * a browser fleet is the single largest operational cost in this category.
 */
export class PlaywrightBrowserDriver implements BrowserDriver {
  readonly kind = 'playwright';
  readonly canScreenshot = true;

  async open(_url: string, _options: NavigateOptions): Promise<PageHandle> {
    throw new EngineError(
      'internal',
      'the Playwright driver is a stub: install playwright and implement open() to use it. ' +
        'The default fetch driver handles plain HTML opt-out forms without it.',
    );
  }
}
