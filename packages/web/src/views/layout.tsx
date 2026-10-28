import type { FC, PropsWithChildren } from 'hono/jsx';

/**
 * One stylesheet, inlined, no external requests, no client framework.
 *
 * A strict CSP with no inline scripts is achievable because nothing on these
 * pages needs script. See docs/adr/0006-ssr-hono-jsx.md.
 */
export const STYLES = `
:root{--bg:#fbfaf8;--fg:#1c1b19;--muted:#6b665e;--line:#e2ded6;--card:#fff;
--accent:#2b5c4f;--accent-fg:#fff;--warn:#8a5a00;--warn-bg:#fdf5e4;--bad:#8a2f24;--bad-bg:#fbeeec;
--ok:#1f5e3a;--ok-bg:#eaf4ee;--radius:10px}
@media(prefers-color-scheme:dark){:root{--bg:#161513;--fg:#eceae5;--muted:#a09a90;--line:#302d28;
--card:#1f1e1b;--accent:#6fb39c;--accent-fg:#101512;--warn:#e4b35c;--warn-bg:#2a2317;
--bad:#e49086;--bad-bg:#2b1c19;--ok:#7dc49a;--ok-bg:#16241c}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);
font:16px/1.6 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
a{color:var(--accent)}
.wrap{max-width:62rem;margin:0 auto;padding:1.5rem 1.25rem 4rem}
header.top{border-bottom:1px solid var(--line);background:var(--card)}
header.top .wrap{display:flex;gap:1.25rem;align-items:baseline;padding:1rem 1.25rem;flex-wrap:wrap}
header.top strong{font-size:1.1rem;letter-spacing:-.01em}
nav a{margin-right:1rem;text-decoration:none;color:var(--muted)}
nav a:hover,nav a[aria-current]{color:var(--fg);text-decoration:underline}
h1{font-size:1.6rem;letter-spacing:-.02em;margin:1.5rem 0 .5rem}
h2{font-size:1.15rem;margin:2rem 0 .5rem}
p.lede{color:var(--muted);margin-top:0;max-width:52rem}
.card{background:var(--card);border:1px solid var(--line);border-radius:var(--radius);padding:1.25rem;margin:1rem 0}
.grid{display:grid;gap:1rem;grid-template-columns:repeat(auto-fit,minmax(11rem,1fr))}
.stat{background:var(--card);border:1px solid var(--line);border-radius:var(--radius);padding:1rem}
.stat b{display:block;font-size:2rem;line-height:1.1;letter-spacing:-.03em}
.stat span{color:var(--muted);font-size:.85rem}
table{width:100%;border-collapse:collapse;font-size:.93rem}
.scroll{overflow-x:auto}
th,td{text-align:left;padding:.6rem .5rem;border-bottom:1px solid var(--line);vertical-align:top}
th{color:var(--muted);font-weight:600;font-size:.8rem;text-transform:uppercase;letter-spacing:.04em}
.pill{display:inline-block;padding:.1rem .5rem;border-radius:999px;font-size:.78rem;white-space:nowrap}
.pill.ok{background:var(--ok-bg);color:var(--ok)}
.pill.warn{background:var(--warn-bg);color:var(--warn)}
.pill.bad{background:var(--bad-bg);color:var(--bad)}
.pill.idle{background:var(--line);color:var(--muted)}
label{display:block;margin:.85rem 0 .25rem;font-weight:600;font-size:.9rem}
.hint{color:var(--muted);font-size:.85rem;font-weight:400;display:block;margin-top:.1rem}
input[type=text],input[type=email],input[type=password],input[type=date],select,textarea{
width:100%;padding:.55rem .65rem;border:1px solid var(--line);border-radius:8px;
background:var(--bg);color:var(--fg);font:inherit}
button,.btn{font:inherit;font-weight:600;padding:.55rem 1rem;border-radius:8px;border:1px solid var(--accent);
background:var(--accent);color:var(--accent-fg);cursor:pointer;text-decoration:none;display:inline-block}
button.secondary,.btn.secondary{background:transparent;color:var(--fg);border-color:var(--line)}
button.danger{background:var(--bad);border-color:var(--bad);color:#fff}
.row{display:flex;gap:.6rem;flex-wrap:wrap;align-items:center}
.consent{display:flex;gap:.6rem;align-items:flex-start;margin:.7rem 0}
.consent input{margin-top:.35rem}
.doc{white-space:pre-wrap;font:13px/1.55 ui-monospace,SFMono-Regular,Menlo,monospace;
background:var(--bg);border:1px solid var(--line);border-radius:8px;padding:1rem;max-height:22rem;overflow:auto}
.notice{border-left:3px solid var(--accent);padding:.5rem .9rem;background:var(--card);margin:1rem 0}
.notice.warn{border-color:var(--warn)}
.notice.bad{border-color:var(--bad)}
.muted{color:var(--muted)}
.compare{width:100%;font-size:.9rem}
.compare td:first-child{color:var(--muted);width:9rem}
.bar{height:6px;background:var(--line);border-radius:3px;overflow:hidden;margin-top:.3rem}
.bar i{display:block;height:100%;background:var(--accent)}
footer{margin-top:3rem;padding-top:1rem;border-top:1px solid var(--line);color:var(--muted);font-size:.85rem}
`;

export interface LayoutProps {
  readonly title: string;
  readonly nav?: { href: string; label: string; current?: boolean }[];
  readonly flash?: { kind: 'info' | 'warn' | 'bad'; message: string };
}

export const Layout: FC<PropsWithChildren<LayoutProps>> = ({ title, nav, flash, children }) => (
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width,initial-scale=1" />
      <meta name="robots" content="noindex,nofollow" />
      <title>{title} — deletewe</title>
      <style dangerouslySetInnerHTML={{ __html: STYLES }} />
    </head>
    <body>
      <header class="top">
        <div class="wrap">
          <strong>deletewe</strong>
          <nav>
            {(nav ?? []).map((item) => (
              <a href={item.href} aria-current={item.current ? 'page' : undefined}>
                {item.label}
              </a>
            ))}
          </nav>
        </div>
      </header>
      <main class="wrap">
        {flash ? <div class={`notice ${flash.kind === 'info' ? '' : flash.kind}`}>{flash.message}</div> : null}
        {children}
      </main>
      <footer class="wrap">
        deletewe is free software under the AGPL-3.0. It acts only for you, only with your
        recorded consent, and it never solves a CAPTCHA or looks anybody else up.
      </footer>
    </body>
  </html>
);

export const MEMBER_NAV = (current: string) =>
  [
    { href: '/dashboard', label: 'Dashboard' },
    { href: '/review', label: 'Review' },
    { href: '/tasks', label: 'Your tasks' },
    { href: '/drop', label: 'California DROP' },
    { href: '/profile', label: 'Profile' },
    { href: '/reports', label: 'Reports' },
    { href: '/account', label: 'Account' },
  ].map((item) => ({ ...item, current: item.href === current }));
