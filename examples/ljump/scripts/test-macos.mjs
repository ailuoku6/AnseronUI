import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const app = fileURLToPath(new URL('../', import.meta.url));
const output = join(app, '.verification/window-lifecycle');
mkdirSync(join(app, '.verification/test-module-cache'), { recursive: true });
execFileSync('xcrun', ['swiftc', '-swift-version', '5', '-parse-as-library',
  '-module-cache-path', join(app, '.verification/test-module-cache'),
  '../../packages/render-macos/Sources/AnseronUIRenderMacOS/Extensions.swift',
  '../../packages/render-macos/Sources/AnseronUIRenderMacOS/DateTimePicker.swift',
  'platforms/macos/LjumpNative.swift', 'platforms/macos/LjumpWindowThumbnail.swift',
  'platforms/macos/LjumpAppIcon.swift', 'platforms/macos/LjumpReminders.swift', 'platforms/macos/LjumpWindowDetails.swift',
  'tests/Reminders.swift', 'tests/WindowDetails.swift', 'tests/WindowLifecycle.swift', '-o', output,
], { cwd: app, stdio: 'inherit' });
execFileSync(output, [], { cwd: app, stdio: 'inherit', timeout: 20000 });
