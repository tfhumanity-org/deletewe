import { coverage, loadCatalog } from '@deletewe/catalog';
import {
  deleteAccount,
  enqueueFullScan,
  exportMemberData,
  generateReport,
  hashPassword,
  tick,
  type EngineContext,
} from '@deletewe/engine';
import { compose, type Composed } from '@deletewe/selfhost';

export interface CommandResult {
  readonly text: string;
  readonly exitCode?: number;
}

const pad = (value: string | number, width: number) => String(value).padEnd(width);

/** Resolves a member by email without decrypting anything else. */
async function memberIdFor(ctx: EngineContext, email: string): Promise<string | undefined> {
  return (await ctx.store.findMemberByEmail(email))?.row.id;
}

export async function dbMigrate(): Promise<CommandResult> {
  const composed = await compose();
  composed.close();
  return { text: 'Database is up to date.' };
}

export async function catalogValidate(): Promise<CommandResult> {
  const { brokers, issues, ok } = await loadCatalog();
  const errors = issues.filter((i) => i.severity === 'error');
  const lines = issues.map(
    (i) => `${i.severity === 'error' ? 'ERROR' : 'warn '} ${pad(i.brokerId, 26)} [${i.code}] ${i.message}`,
  );
  lines.push('', `${String(brokers.length)} definition(s), ${String(errors.length)} error(s)`);
  return { text: lines.join('\n'), exitCode: ok ? 0 : 1 };
}

export async function catalogReport(): Promise<CommandResult> {
  const { brokers } = await loadCatalog();
  const report = coverage(brokers);
  const section = (title: string, data: Record<string, number>) =>
    [`\n${title}`, ...Object.entries(data).sort((a, b) => b[1] - a[1]).map(([k, v]) => `  ${pad(k, 20)}${String(v)}`)].join('\n');

  return {
    text: [
      `definitions   ${String(report.total)}`,
      `enabled       ${String(report.enabled)}`,
      `verified live ${String(report.verified)}   <- the only number that means coverage`,
      section('By automation level', report.byAutomation),
      section('By opt-out method', report.byMethod),
    ].join('\n'),
  };
}

export async function brokersList(composed: Composed): Promise<CommandResult> {
  const brokers = await composed.ctx.store.listBrokers();
  const lines = [
    `${pad('ID', 28)}${pad('STATUS', 10)}${pad('AUTOMATION', 14)}${pad('METHOD', 10)}VERIFIED`,
    ...brokers.map(
      (b) => `${pad(b.id, 28)}${pad(b.status, 10)}${pad(b.automationLevel, 14)}${pad(b.optOutMethod, 10)}${b.verifiedAt ?? 'never'}`,
    ),
  ];
  return { text: lines.join('\n') };
}

export async function scan(composed: Composed, email: string): Promise<CommandResult> {
  const memberId = await memberIdFor(composed.ctx, email);
  if (!memberId) return { text: `No account for ${email}.`, exitCode: 1 };

  const queued = await enqueueFullScan(composed.ctx, memberId);
  const handled = await composed.queue.drain();
  return { text: `Queued ${String(queued)} scan(s); ran ${String(handled)} job(s).` };
}

export async function runQueue(composed: Composed): Promise<CommandResult> {
  const swept = await tick(composed.ctx);
  const handled = await composed.queue.drain();
  return {
    text: `Swept ${String(swept.rechecks)} due re-check(s) and ${String(swept.jobs)} pending job(s); ran ${String(handled)}.`,
  };
}

export async function status(composed: Composed, email: string): Promise<CommandResult> {
  const found = await composed.ctx.store.findMemberByEmail(email);
  if (!found) return { text: `No account for ${email}.`, exitCode: 1 };

  const dek = await composed.ctx.store.unwrapDekFor(found.row);
  const cases = await composed.ctx.store.listCases(found.row.id);
  const brokers = new Map((await composed.ctx.store.listBrokers()).map((b) => [b.id, b.name]));
  const tasks = await composed.ctx.store.listTasks(found.row.id, dek, 'member', 'open');

  const lines = [
    `${pad('BROKER', 30)}${pad('STATE', 26)}ATTEMPTS`,
    ...cases.map((c) => `${pad(brokers.get(c.brokerId) ?? c.brokerId, 30)}${pad(c.state, 26)}${String(c.attemptCount)}`),
    '',
    `${String(cases.filter((c) => c.state === 'removed').length)} removed, ${String(cases.length)} listing(s) tracked`,
    `${String(tasks.length)} task(s) waiting on you`,
  ];
  return { text: lines.join('\n') };
}

export async function tasks(composed: Composed, email: string): Promise<CommandResult> {
  const found = await composed.ctx.store.findMemberByEmail(email);
  if (!found) return { text: `No account for ${email}.`, exitCode: 1 };

  const dek = await composed.ctx.store.unwrapDekFor(found.row);
  const open = await composed.ctx.store.listTasks(found.row.id, dek, 'member', 'open');
  if (open.length === 0) return { text: 'Nothing waiting on you.' };

  return {
    text: open
      .map((task) =>
        [
          `- ${task.title}`,
          `  ${task.instructions.replace(/\n/g, '\n  ')}`,
          task.deepLink ? `  open: ${task.deepLink}` : '',
          task.prefill ? `  values: ${Object.entries(task.prefill).map(([k, v]) => `${k}=${v}`).join(', ')}` : '',
          `  done:  deletewe task done ${task.id}`,
        ]
          .filter(Boolean)
          .join('\n'),
      )
      .join('\n\n'),
  };
}

export async function report(composed: Composed, email: string): Promise<CommandResult> {
  const found = await composed.ctx.store.findMemberByEmail(email);
  if (!found) return { text: `No account for ${email}.`, exitCode: 1 };

  const dek = await composed.ctx.store.unwrapDekFor(found.row);
  const { summary } = await generateReport(composed.ctx, { memberId: found.row.id, dek });
  return {
    text: [
      `removed             ${String(summary.totals.removed)}`,
      `re-listed           ${String(summary.totals.relisted)}`,
      `sent, awaiting them ${String(summary.totals.awaitingBroker)}`,
      `waiting on you      ${String(summary.totals.awaitingYou)}`,
      `blocked             ${String(summary.totals.blocked)}`,
      `found in total      ${String(summary.totals.found)}`,
      '',
      summary.caveat,
    ].join('\n'),
  };
}

export async function exportData(composed: Composed, email: string): Promise<CommandResult> {
  const found = await composed.ctx.store.findMemberByEmail(email);
  if (!found) return { text: `No account for ${email}.`, exitCode: 1 };

  const dek = await composed.ctx.store.unwrapDekFor(found.row);
  const bundle = await exportMemberData(composed.ctx, { memberId: found.row.id, dek });
  return { text: JSON.stringify(bundle, null, 2) };
}

export async function destroy(composed: Composed, email: string, confirmed: boolean): Promise<CommandResult> {
  if (!confirmed) {
    return { text: 'Refusing to delete without --yes. This is irreversible.', exitCode: 1 };
  }
  const memberId = await memberIdFor(composed.ctx, email);
  if (!memberId) return { text: `No account for ${email}.`, exitCode: 1 };

  const { blobsDeleted } = await deleteAccount(composed.ctx, { memberId });
  return { text: `Deleted the account and ${String(blobsDeleted)} evidence file(s). The encryption key was destroyed first.` };
}

export async function createAdmin(composed: Composed, username: string, password: string): Promise<CommandResult> {
  if (password.length < 12) return { text: 'Operator password must be at least 12 characters.', exitCode: 1 };
  const id = await composed.ctx.store.createAdmin(username, await hashPassword(password));
  return { text: `Created operator "${username}" (${id}).` };
}
