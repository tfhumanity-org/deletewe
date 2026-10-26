import { compose, type Composed } from '@deletewe/selfhost';
import * as commands from './commands.ts';

const USAGE = `deletewe — personal data removal agent

  db migrate                      apply pending database migrations
  catalog validate                validate every broker definition
  catalog report                  coverage breakdown by automation level
  brokers list                    broker status as this instance sees it

  scan <email>                    queue a scan at every eligible broker, then run it
  run                             sweep due re-checks and run pending jobs
  status <email>                  per-broker status for one member
  tasks <email>                   the steps only that member can do
  task done <task-id> <email>     mark a guided task complete
  report <email>                  generate and print a period report
  export <email>                  print the full data export as JSON
  delete <email> --yes            delete an account, irreversibly

  admin create <username> <pw>    create an operator account

Everything acts on the local self-hosted instance in DELETEWE_DATA_DIR
(default ./data). Nothing is sent to any broker unless the member has a
live consent and a signed mandate.
`;

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  const [group, ...rest] = argv;

  if (!group || group === 'help' || group === '--help' || group === '-h') {
    process.stdout.write(USAGE);
    return 0;
  }

  // Commands that never need the database or key material.
  if (group === 'catalog') {
    const result = rest[0] === 'report' ? await commands.catalogReport() : await commands.catalogValidate();
    process.stdout.write(`${result.text}\n`);
    return result.exitCode ?? 0;
  }
  if (group === 'db' && rest[0] === 'migrate') {
    const result = await commands.dbMigrate();
    process.stdout.write(`${result.text}\n`);
    return 0;
  }

  const composed = await compose();
  try {
    const result = await dispatch(composed, group, rest);
    process.stdout.write(`${result.text}\n`);
    return result.exitCode ?? 0;
  } finally {
    composed.close();
  }
}

async function dispatch(composed: Composed, group: string, rest: string[]): Promise<commands.CommandResult> {
  const need = (index: number, what: string): string => {
    const value = rest[index];
    if (!value) throw new Error(`missing ${what}`);
    return value;
  };

  switch (group) {
    case 'brokers':
      return commands.brokersList(composed);
    case 'scan':
      return commands.scan(composed, need(0, 'email'));
    case 'run':
      return commands.runQueue(composed);
    case 'status':
      return commands.status(composed, need(0, 'email'));
    case 'tasks':
      return commands.tasks(composed, need(0, 'email'));
    case 'task': {
      if (rest[0] !== 'done') return { text: USAGE, exitCode: 1 };
      const taskId = need(1, 'task id');
      const email = need(2, 'email');
      const found = await composed.ctx.store.findMemberByEmail(email);
      if (!found) return { text: `No account for ${email}.`, exitCode: 1 };
      const dek = await composed.ctx.store.unwrapDekFor(found.row);
      const { completeGuidedTask } = await import('@deletewe/engine');
      await completeGuidedTask(composed.ctx, { memberId: found.row.id, dek, taskId, done: true });
      return { text: 'Marked done. The re-check still has to prove the removal.' };
    }
    case 'report':
      return commands.report(composed, need(0, 'email'));
    case 'export':
      return commands.exportData(composed, need(0, 'email'));
    case 'delete':
      return commands.destroy(composed, need(0, 'email'), rest.includes('--yes'));
    case 'admin':
      if (rest[0] !== 'create') return { text: USAGE, exitCode: 1 };
      return commands.createAdmin(composed, need(1, 'username'), need(2, 'password'));
    default:
      return { text: USAGE, exitCode: 1 };
  }
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
