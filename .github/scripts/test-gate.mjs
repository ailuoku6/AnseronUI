import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const requiredJobs = ['unit', 'runtime', 'android-build', 'device-config', 'android'];
const optionalJobs = new Set(['harmony']);

export function evaluateTestGate(needs) {
  if (!needs || typeof needs !== 'object' || Array.isArray(needs)) throw new Error('Missing test job results');
  const errors = requiredJobs.filter(job => !Object.hasOwn(needs, job)).map(job => `${job}: missing result`);
  const skipped = [];
  for (const [job, value] of Object.entries(needs)) {
    if (value?.result === 'success') continue;
    if (value?.result === 'skipped' && optionalJobs.has(job)) skipped.push(job);
    else errors.push(`${job}: ${value?.result ?? 'missing result'}`);
  }
  return { ok: errors.length === 0, errors, skipped };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const needs = JSON.parse(process.env.TEST_JOB_RESULTS ?? 'null');
  const verdict = evaluateTestGate(needs);
  const summary = '### Test gate: ' + (verdict.ok ? 'passed' : 'failed') + '\n\n' +
    Object.entries(needs).map(([job, value]) => `- ${job}: ${value.result}`).join('\n') + '\n' +
    (verdict.skipped.length ? '\nOptional jobs skipped: ' + verdict.skipped.join(', ') + '.\n' : '');
  console.log(summary);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
  for (const error of verdict.errors) console.error(`::error::Test gate rejected ${error}`);
  if (!verdict.ok) process.exitCode = 1;
}
