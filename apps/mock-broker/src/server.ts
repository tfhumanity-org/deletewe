import { Hono } from 'hono';

/**
 * A stand-in data broker for end-to-end tests.
 *
 * It behaves like the real thing in the ways that matter: a searchable index
 * with same-name decoys, an opt-out form with a hidden token, an emailed
 * confirmation link, and a record that only disappears once the opt-out is
 * confirmed. Driving the engine against this instead of a live site is what
 * lets the full loop be tested without sending a single real request.
 */
export interface MockPerson {
  readonly id: string;
  readonly name: string;
  readonly city: string;
  readonly state: string;
  readonly age: string;
}

export interface MockBrokerState {
  readonly people: Map<string, MockPerson>;
  readonly removed: Set<string>;
  readonly pendingConfirmations: Map<string, string>;
  readonly submissions: { personId: string; email: string }[];
  /** Flip to simulate a broker redesign breaking a definition. */
  redesigned: boolean;
}

export const DEFAULT_PEOPLE: readonly MockPerson[] = [
  { id: 'ada-94704', name: 'Ada Lovelace', city: 'Berkeley', state: 'CA', age: 'Age 46' },
  { id: 'ada-33101', name: 'Ada Lovelace', city: 'Miami', state: 'FL', age: 'Age 23' },
  { id: 'hannah-74103', name: 'Hannah Lindqvist', city: 'Tulsa', state: 'OK', age: 'Age 66' },
];

export function createMockBrokerState(people: readonly MockPerson[] = DEFAULT_PEOPLE): MockBrokerState {
  return {
    people: new Map(people.map((p) => [p.id, p])),
    removed: new Set(),
    pendingConfirmations: new Map(),
    submissions: [],
    redesigned: false,
  };
}

const layout = (body: string) => `<!doctype html><html><head><title>Mock Broker</title></head><body>${body}</body></html>`;

const slug = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export function createMockBroker(state: MockBrokerState = createMockBrokerState()): {
  app: Hono;
  state: MockBrokerState;
} {
  const app = new Hono();

  app.get('/', (c) => c.html(layout('<h1>Mock Broker</h1>')));

  app.get('/search/:name', (c) => {
    const wanted = c.req.param('name');
    const results = [...state.people.values()].filter(
      (p) => slug(p.name) === wanted && !state.removed.has(p.id),
    );
    const items = results
      .map(
        (p) => `
        <li class="result">
          <a class="link" href="/p/${p.id}">${p.name}</a>
          <span class="name">${p.name}</span>
          <span class="city">${p.city}</span>
          <span class="state">${p.state}</span>
          <span class="age">${p.age}</span>
        </li>`,
      )
      .join('');
    return c.html(layout(`<ul class="results">${items}</ul>`));
  });

  app.get('/p/:id', (c) => {
    const person = state.people.get(c.req.param('id'));
    if (!person || state.removed.has(person.id)) return c.html(layout('<p id="gone">No such record.</p>'), 404);
    return c.html(layout(`<h1 class="name">${person.name}</h1><p class="city">${person.city}</p>`));
  });

  app.get('/optout', (c) => {
    if (state.redesigned) {
      return c.html(layout('<form method="post" action="/optout"><input name="listingUrl"></form>'));
    }
    return c.html(
      layout(`
      <form method="post" action="/optout">
        <input type="hidden" name="token" value="mock-token">
        <input id="listing" name="url" value="">
        <input id="email" name="email" value="">
        <button id="submit" type="submit">Submit</button>
      </form>`),
    );
  });

  app.post('/optout', async (c) => {
    const form = await c.req.formData();
    const url = String(form.get('url') ?? '');
    const email = String(form.get('email') ?? '');
    const personId = /\/p\/([^/?#]+)/.exec(url)?.[1];

    if (!personId || !state.people.has(personId)) {
      return c.html(layout('<p id="error">We could not find that listing.</p>'), 400);
    }

    const confirmation = `confirm-${personId}`;
    state.pendingConfirmations.set(confirmation, personId);
    state.submissions.push({ personId, email });

    return c.html(layout('<p id="receipt">Your removal request was received. Check your email to confirm.</p>'));
  });

  app.get('/confirm/:token', (c) => {
    const personId = state.pendingConfirmations.get(c.req.param('token'));
    if (!personId) return c.html(layout('<p id="invalid">That link is not valid.</p>'), 400);

    state.removed.add(personId);
    state.pendingConfirmations.delete(c.req.param('token'));
    return c.html(layout('<p id="confirmed">Your opt-out is confirmed.</p>'));
  });

  return { app, state };
}

/** Builds the confirmation email the mock broker would have sent. */
export function confirmationEmail(params: {
  to: string;
  personId: string;
  origin: string;
  from?: string;
}): string {
  return [
    `From: ${params.from ?? 'no-reply@broker.test'}`,
    `To: ${params.to}`,
    'Subject: Confirm your removal request',
    'Authentication-Results: mx.agent.test; spf=pass; dkim=pass',
    'Content-Type: text/plain; charset=utf-8',
    '',
    'Someone asked us to remove a record. If that was you, confirm here:',
    `${params.origin}/confirm/confirm-${params.personId}`,
    '',
    'If it was not you, ignore this message.',
  ].join('\n');
}
