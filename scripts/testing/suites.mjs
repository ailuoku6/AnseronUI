const npm = (...names) => names.map(name => ['npm', 'run', name]);
const node = (...args) => [process.execPath, ...args];
export const browserSuites = ['extensions', 'layout', 'styles', 'routing', 'accessibility', 'virtual-list', 'split', 'accessibility-wasm', 'virtual-list-wasm'];

// Each suite runs serially: Core builds share staging directories. CI runs
// suites in separate jobs/checkouts instead of racing those directories.
export const suites = {
  unit: [...npm('typecheck:framework', 'typecheck:layout', 'test:framework', 'test:build', 'test:tooling', 'test:devtools', 'test:harmony', 'test:layout:upstream', 'test:package')],
  layout: [...npm('prepare:compiler', 'test:layout:wasm')],
  native: [...npm('prepare:compiler', 'build:core:native', 'test:core:native'), node('scripts/test-core-lifecycle.mjs'), ...npm('test:stacks'),
    node('scripts/build-core.mjs', 'native', 'internal/fixtures/fine-grained/config.json'), node('--import', 'tsx', 'scripts/test-fine-grained-aot.mjs', 'native')],
  wasm: [...npm('prepare:compiler', 'build:core:wasm', 'test:core:wasm', 'test:devtools:wasm'),
    node('scripts/build-core.mjs', 'wasm', 'internal/fixtures/fine-grained/config.json'), node('--import', 'tsx', 'scripts/test-fine-grained-aot.mjs', 'wasm')],
  web: [...npm('prepare:compiler', 'build:web'), ...browserSuites.map(name => node('scripts/test-web-extensions.mjs', name))],
  ios: [...npm('prepare:compiler'), node('--test', 'scripts/anseronui.test.mjs'), node('scripts/test-native-icons.mjs', 'ios'), node('scripts/test-ios.mjs')],
  macos: [...npm('prepare:compiler', 'test:macos'), ['.verification/macos-tests/integration', '--renderer-regressions'], ['.verification/macos-tests/integration', '--drag-regression'], ['.verification/macos-tests/integration', '--devtools-regression']],
  'android-build': [...npm('prepare:compiler'), node('scripts/test-native-icons.mjs', 'android'), ...npm('build:android'), ['examples/native/android/gradlew', '-p', 'examples/native/android', ':app:assembleDebugAndroidTest', '--console=plain', '--no-daemon']],
  android: [...npm('prepare:compiler'), node('scripts/test-android.mjs')],
  harmony: [...npm('prepare:compiler'), node('scripts/test-harmony-ci.mjs')],
};

export function validateSuite(name) {
  if (!Object.hasOwn(suites, name)) throw new Error(`Unknown suite ${JSON.stringify(name)}. Choose: ${Object.keys(suites).join(', ')}`);
  return suites[name];
}
