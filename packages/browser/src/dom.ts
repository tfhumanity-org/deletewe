import { parse, HTMLElement as HTMLElementCtor, type HTMLElement } from 'node-html-parser';
import type { ElementSnapshot } from '@deletewe/engine';

/** Pure-JS DOM handling, so the same code runs on Workers and on Node. */
export function parseDocument(html: string): HTMLElement {
  return parse(html, { blockTextElements: { script: false, noscript: false, style: false } });
}

export function toSnapshot(element: HTMLElement): ElementSnapshot {
  const attrs: Record<string, string> = {};
  for (const [key, value] of Object.entries(element.attributes)) {
    if (typeof value === 'string') attrs[key] = value;
  }
  return {
    text: element.text ?? '',
    html: element.innerHTML ?? '',
    attrs,
    find(selector: string): ElementSnapshot | null {
      const found = selectWithin(element, selector);
      return found ? toSnapshot(found) : null;
    },
  };
}

/**
 * Extraction scopes to the first descendant matching `selector`, falling back
 * to the element itself so a definition can read an attribute off the result
 * container (`{ selector: 'self', attr: 'href' }`).
 */
/**
 * Builds a snapshot from an element's rendered outerHTML.
 *
 * Lets a real-browser driver reuse the same extraction semantics as the
 * fixture driver: take the DOM after scripts have run, then query within it
 * locally. `ElementSnapshot.find` is synchronous, so a live round-trip to the
 * browser for every field is not an option anyway.
 */
export function snapshotFromHtml(outerHtml: string): ElementSnapshot {
  const root = parse(outerHtml);
  const element = root.childNodes.find((n) => n instanceof HTMLElementCtor) as HTMLElement | undefined;
  return toSnapshot(element ?? (root as unknown as HTMLElement));
}

export function selectWithin(root: HTMLElement, selector: string): HTMLElement | undefined {
  if (selector === 'self' || selector === ':scope') return root;
  try {
    return root.querySelector(selector) ?? undefined;
  } catch {
    return undefined;
  }
}

export function queryAll(root: HTMLElement, selector: string): HTMLElement[] {
  try {
    return root.querySelectorAll(selector);
  } catch {
    return [];
  }
}

export interface FormField {
  readonly name: string;
  readonly value: string;
}

export interface FormDescriptor {
  readonly action: string;
  readonly method: string;
  readonly enctype: string;
  readonly fields: FormField[];
}

/**
 * Reads a plain HTML form, including hidden fields and defaulted selects, so
 * a fetch-based submission reproduces what a browser would send.
 */
export function describeForm(form: HTMLElement, pageUrl: string): FormDescriptor {
  const fields: FormField[] = [];

  for (const input of form.querySelectorAll('input')) {
    const name = input.getAttribute('name');
    if (!name) continue;
    const type = (input.getAttribute('type') ?? 'text').toLowerCase();
    if (type === 'submit' || type === 'button' || type === 'file' || type === 'image') continue;
    if ((type === 'checkbox' || type === 'radio') && input.getAttribute('checked') === null) continue;
    fields.push({ name, value: input.getAttribute('value') ?? (type === 'checkbox' ? 'on' : '') });
  }

  for (const textarea of form.querySelectorAll('textarea')) {
    const name = textarea.getAttribute('name');
    if (name) fields.push({ name, value: textarea.text ?? '' });
  }

  for (const select of form.querySelectorAll('select')) {
    const name = select.getAttribute('name');
    if (!name) continue;
    const options = select.querySelectorAll('option');
    const chosen = options.find((o) => o.getAttribute('selected') !== null) ?? options[0];
    fields.push({ name, value: chosen?.getAttribute('value') ?? chosen?.text?.trim() ?? '' });
  }

  const action = form.getAttribute('action');
  return {
    action: action ? new URL(action, pageUrl).toString() : pageUrl,
    method: (form.getAttribute('method') ?? 'GET').toUpperCase(),
    enctype: form.getAttribute('enctype') ?? 'application/x-www-form-urlencoded',
    fields,
  };
}

/** The form containing `selector`, or the page's only form. */
export function formFor(root: HTMLElement, selector: string | undefined): HTMLElement | undefined {
  if (selector) {
    const target = selectWithin(root, selector);
    let node: HTMLElement | null | undefined = target;
    while (node) {
      if (node.rawTagName?.toLowerCase() === 'form') return node;
      node = node.parentNode as HTMLElement | null;
    }
  }
  return root.querySelector('form') ?? undefined;
}

export function hostAllowed(url: string, allowedHosts: readonly string[]): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return allowedHosts.some((a) => host === a || host.endsWith(`.${a}`));
  } catch {
    return false;
  }
}
