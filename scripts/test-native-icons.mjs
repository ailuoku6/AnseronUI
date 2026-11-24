import { command } from './testing/process.mjs';

const platform = process.argv[2];
if (!['ios', 'android'].includes(platform)) throw new Error('Choose ios or android for native icon compilation.');
if (platform === 'ios' && process.platform !== 'darwin') throw new Error('iOS icon compilation requires macOS and Xcode.');
await command(process.execPath, ['--test', `--test-name-pattern=^native ${platform === 'ios' ? 'iOS compiler' : 'Android resource compiler'}`, 'scripts/app-icons.test.mjs'], {
  env: { ...process.env, ANSERONUI_TEST_NATIVE_ICONS: '1' },
});
