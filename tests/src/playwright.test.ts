import { afterAll, describe, expect, it } from 'vitest';
import { serve } from '@hono/node-server';
import { PlaywrightBrowserDriver } from '@deletewe/adapters-node';
import { createMockBroker, createMockBrokerState } from '@deletewe/mock-broker';
import { Hono } from 'hono';

/**
 * The Playwright driver against a real Chromium, driving the mock broker.
 *
 * Playwright is an optional dependency. When it is not installed these tests
 * skip rather than fail, so CI and a lean self-host install stay green.
 */

/**
 * The package being installed is not enough — the browser binary is a separate
 * download. Check for the executable, or CI installs playwright, skips nothing,
 * and then fails on launch.
 */
const havePlaywright = await (async () => {
  try {
    const { chromium } = await import('playwright');
    const { existsSync } = await import('node:fs');
    const path = chromium.executablePath();
    return typeof path === 'string' && existsSync(path);
  } catch {
    return false;
  }
})();

if (!havePlaywright) {
  // eslint-disable-next-line no-console
  console.log('skipping Playwright driver tests: run `npx playwright install chromium` to enable them');
}

const describeIf = havePlaywright ? describe : describe.skip;

const driver = new PlaywrightBrowserDriver();
const servers: { close: () => void }[] = [];

afterAll(async () => {
  await driver.dispose();
  for (const s of servers) s.close();
});

async function listen(app: Hono): Promise<string> {
  const port = await new Promise<number>((resolve) => {
    const server = serve({ fetch: app.fetch, port: 0, hostname: '127.0.0.1' }, (info) => { resolve(info.port); });
    servers.push(server as unknown as { close: () => void });
  });
  return `http://127.0.0.1:${String(port)}`;
}

const nav = (hosts: string[]) => ({ allowedHosts: hosts, userAgent: 'deletewe-test', timeoutMs: 15_000 });

describeIf('the Playwright driver', () => {
  it('renders a page and extracts scoped fields', async () => {
    const origin = await listen(createMockBroker(createMockBrokerState()).app);
    const page = await driver.open(`${origin}/search/ada-lovelace`, nav(['127.0.0.1']));

    const results = await page.queryAll('.result');
    expect(results).toHaveLength(2);

    // The scoped lookup must work, or extraction silently reads the whole card.
    expect(results[0]?.find('.name')?.text).toBe('Ada Lovelace');
    expect(results[0]?.find('.city')?.text).toBe('Berkeley');
    expect(results[0]?.find('a.link')?.attrs['href']).toContain('/p/ada-94704');
    expect(results[0]?.find('.nonexistent')).toBeNull();

    await page.close();
  });

  // The thing the fetch driver cannot do, and the reason this driver exists.
  it('sees content that only exists after JavaScript runs', async () => {
    const app = new Hono();
    app.get('/', (c) =>
      c.html(`<!doctype html><html><body><div id="host"></div><script>
        document.getElementById('host').innerHTML =
          '<li class="result"><span class="name">Rendered Person</span></li>';
      </script></body></html>`),
    );
    const origin = await listen(app);

    const page = await driver.open(origin, nav(['127.0.0.1']));
    await page.waitFor('.result', 5000);

    expect((await page.queryAll('.result'))[0]?.find('.name')?.text).toBe('Rendered Person');
    await page.close();
  });

  it('produces a real PNG screenshot', async () => {
    const origin = await listen(createMockBroker(createMockBrokerState()).app);
    const page = await driver.open(origin, nav(['127.0.0.1']));

    const shot = await page.screenshot();

    expect(shot).toBeDefined();
    expect(shot!.length).toBeGreaterThan(1000);
    // PNG magic number.
    expect([...shot!.slice(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
    await page.close();
  });

  it('fills and submits a form', async () => {
    const { app, state } = createMockBroker(createMockBrokerState());
    const origin = await listen(app);

    const page = await driver.open(`${origin}/optout`, nav(['127.0.0.1']));
    await page.fill('#listing', `${origin}/p/ada-94704`);
    await page.fill('#email', 'ada@member.test');
    await page.click('#submit');

    expect(await page.querySelector('#receipt')).not.toBeNull();
    expect(state.submissions).toEqual([{ personId: 'ada-94704', email: 'ada@member.test' }]);
    await page.close();
  });

  it('refuses to open a host the definition did not declare', async () => {
    await expect(driver.open('https://attacker.example/', nav(['broker.test']))).rejects.toThrow(/allowlist/);
  });

  // Stronger than the fetch driver manages: a rendered page pulls subresources
  // of its own, and none of those may leave the declared hosts either.
  it('blocks a subresource request to an off-allowlist host', async () => {
    const app = new Hono();
    app.get('/', (c) =>
      c.html(`<!doctype html><html><body><p id="here">ok</p>
        <img src="https://attacker.example/pixel.png">
        </body></html>`),
    );
    const origin = await listen(app);

    const page = await driver.open(origin, nav(['127.0.0.1']));
    await page.waitFor(undefined, 300);

    expect(await page.querySelector('#here')).not.toBeNull();
    const blocked = (page as unknown as { blockedRequests(): string[] }).blockedRequests();
    expect(blocked.some((u) => u.includes('attacker.example'))).toBe(true);
    await page.close();
  });

  it('reports a missing selector rather than hanging', async () => {
    const origin = await listen(createMockBroker(createMockBrokerState()).app);
    const page = await driver.open(`${origin}/optout`, nav(['127.0.0.1']));

    await expect(page.fill('#does-not-exist', 'x')).rejects.toThrow();
    await page.close();
  });
});

describe('Playwright driver availability', () => {
  it('declares that it can screenshot', () => {
    expect(new PlaywrightBrowserDriver().canScreenshot).toBe(true);
    expect(new PlaywrightBrowserDriver().kind).toBe('playwright');
  });
});
