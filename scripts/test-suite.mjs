import { createWriteStream } from 'node:fs';
import { mkdir, writeFile, appendFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { finished } from 'node:stream/promises';
import { command, withHTTPFixture } from './testing/process.mjs';
import { suites, validateSuite } from './testing/suites.mjs';

process.chdir(fileURLToPath(new URL('../', import.meta.url)));
const name = process.argv[2] ?? 'unit';
if (name === '--list') { console.log(Object.keys(suites).join('\n')); process.exit(0); }
const steps = validateSuite(name);
const directory = `.verification/tests/${name}`;
await mkdir(directory, { recursive: true });
const report = { suite: name, startedAt: new Date().toISOString(), platform: `${process.platform}-${process.arch}`, status: 'running', steps: steps.map(command => ({ command, status: 'not-run' })) };
const save = () => writeFile(`${directory}/results.json`, JSON.stringify(report, null, 2) + '\n');
await save();
async function run() {
  for (const [index, step] of report.steps.entries()) {
    step.status = 'running'; step.log = `${directory}/${String(index + 1).padStart(2, '0')}.log`; await save();
    const log = createWriteStream(step.log);
    const started = Date.now();
    console.log(`\n[${name} ${index + 1}/${steps.length}] ${step.command.join(' ')}`);
    try { await command(step.command[0], step.command.slice(1), { log }); step.status = 'passed'; }
    catch (error) { step.status = 'failed'; step.error = String(error); throw error; }
    finally { step.durationMs = Date.now() - started; log.end(); await finished(log); await save(); }
  }
}
try {
  if (name === 'macos') await withHTTPFixture(run); else await run();
  report.status = 'passed';
} catch (error) {
  report.status = 'failed'; report.error = String(error); console.error(error); process.exitCode = 1;
} finally {
  report.finishedAt = new Date().toISOString(); await save();
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, `### ${name}: ${report.status}\n\n` + report.steps.map(step => `- ${step.status}: \`${step.command.join(' ')}\``).join('\n') + '\n');
}
