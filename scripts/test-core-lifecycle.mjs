import { fileURLToPath } from 'node:url';
import { command } from './testing/process.mjs';

process.chdir(fileURLToPath(new URL('../', import.meta.url)));
await command('clang', ['-I', 'packages/core/native/include', 'packages/core/native/transport.c', 'packages/core/native/test/lifecycle.c', '.verification/core-native/entry.lib.a', '-pthread', '-lm', '-o', '.verification/core-native/lifecycle']);
await command('.verification/core-native/lifecycle', [], { timeout: 120_000 });
