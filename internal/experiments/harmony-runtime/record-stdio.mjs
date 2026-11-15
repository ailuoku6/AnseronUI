// Record a passing native Core session for deterministic replay on OHOS.
import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
const name = process.env.HARMONY_CASE;
if (!/^(counter|async-form|components|extensions|timers)$/.test(name ?? '')) throw new Error('Invalid HARMONY_CASE');
const base = `.verification/harmony-api21/replay/${name}`;
const input = createWriteStream(base + '.input');
const output = createWriteStream(base + '.expected');
const child = spawn('.verification/core-native/probe', [], { stdio: ['pipe', 'pipe', 'inherit'] });
process.stdin.on('data', chunk => { input.write(chunk); child.stdin.write(chunk); });
process.stdin.on('end', () => { input.end(); child.stdin.end(); });
child.stdout.on('data', chunk => { output.write(chunk); process.stdout.write(chunk); });
child.on('error', error => { console.error(error); process.exitCode = 1; });
child.on('exit', code => { output.end(); process.exitCode = code ?? 1; });
