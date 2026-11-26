import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';
import { browserSuites, wasmBrowserSuites, suites } from './testing/suites.mjs';

const root = resolve('.');
const read = path => readFileSync(resolve(root, path), 'utf8');
const parse = path => ts.createSourceFile(path, read(path), ts.ScriptTarget.Latest, true);
const walk = (node, callback) => { callback(node); ts.forEachChild(node, child => walk(child, callback)); };
const files = dir => readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? files(`${dir}/${entry.name}`) : [`${dir}/${entry.name}`]);
const testFiles = ['ui', 'core', 'ui-compiler'].flatMap(name => files(`packages/${name}/test`)).filter(path => /\.test\.tsx?$/.test(path));

function interfaceMethods(source, interfaceName) {
  const interfaces = new Map(source.statements.filter(ts.isInterfaceDeclaration).map(node => [node.name.text, node]));
  const visit = (members, prefix = '') => members.flatMap(member => {
    const name = member.name?.getText(source);
    if (ts.isMethodSignature(member)) return [prefix + name];
    if (!ts.isPropertySignature(member)) return [];
    if (member.type && ts.isTypeLiteralNode(member.type)) return visit(member.type.members, prefix + name + '.');
    if (member.type && ts.isTypeReferenceNode(member.type)) {
      const nested = interfaces.get(member.type.typeName.getText(source));
      if (nested) return visit(nested.members, prefix + name + '.');
    }
    return [];
  });
  assert.ok(interfaces.has(interfaceName), `Missing public interface: ${interfaceName}`);
  return visit(interfaces.get(interfaceName).members).sort();
}

test('every NativeServices method has a parameter/result/error or subscription contract', () => {
  const methods = interfaceMethods(parse('packages/ui/src/native-services.ts'), 'NativeServices');
  const paths = [];
  walk(parse('packages/ui/test/native-services.test.ts'), node => {
    if (ts.isPropertyAssignment(node) && node.name.getText() === 'path' && ts.isStringLiteral(node.initializer)) paths.push(node.initializer.text);
  });
  assert.ok(methods.length > 60, 'NativeServices inventory must include inline declarations and storage interfaces');
  assert.equal(new Set(paths).size, paths.length, 'Duplicate service coverage entry');
  assert.deepEqual(paths.sort(), methods, 'NativeServices API and executable contract paths differ');
});

test('every host tag and browser suite has an executable coverage entry', () => {
  const ui = parse('packages/ui/src/index.ts');
  const tags = ui.statements.find(node => ts.isTypeAliasDeclaration(node) && node.name.text === 'HostTag').type.types.map(node => node.literal.text);
  const mounted = new Set();
  for (const file of testFiles) walk(parse(file), node => {
    if (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) mounted.add(node.tagName.getText());
  });
  for (const tag of tags) assert.ok(mounted.has(tag === 'Native' ? 'NativeComponent' : tag), `Host tag is not mounted in runtime tests: ${tag}`);
  for (const suite of [...browserSuites, ...wasmBrowserSuites]) {
    assert.ok(existsSync(resolve(root, `packages/render-web/test/${suite === 'virtual-list-wasm' ? 'virtual-list' : suite === 'text-measurement-wasm' ? 'text-measurement' : suite}.browser.ts`)), `Missing browser suite source: ${suite}`);
  }
});

test('every public UI function and JSX alias is invoked in executable tests', () => {
  const exported = new Set();
  for (const file of ['index', 'native-services', 'timers', 'template', 'jsx-runtime']) {
    for (const node of parse(`packages/ui/src/${file}.ts`).statements) {
      if (!node.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword)) continue;
      if (ts.isFunctionDeclaration(node)) exported.add(node.name.text);
      if (ts.isVariableStatement(node)) for (const declaration of node.declarationList.declarations) {
        if (declaration.initializer && ts.isIdentifier(declaration.initializer) && declaration.initializer.text === 'jsx') exported.add(declaration.name.getText());
      }
    }
  }
  const invoked = new Set();
  for (const file of testFiles) walk(parse(file), node => {
    if (ts.isCallExpression(node) || ts.isNewExpression(node)) invoked.add(node.expression.getText());
    if (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) invoked.add(node.tagName.getText());
  });
  for (const name of exported) assert.ok(invoked.has(name), `Public UI function has no direct call in an executable test: ${name}`);
  const handleMethods = interfaceMethods(parse('packages/ui/src/index.ts'), 'NodeHandle');
  for (const method of handleMethods) assert.ok([...invoked].some(call => call.endsWith('.' + method)), `NodeHandle method has no executable call: ${method}`);
});

test('every CI suite and browser test is registered with a runnable command', () => {
  for (const [name, steps] of Object.entries(suites)) {
    assert.ok(steps.length > 0, `Suite has no commands: ${name}`);
    assert.match(name, /^[a-z][a-z-]+$/);
  }
  for (const name of ['unit', 'layout', 'native', 'wasm', 'web', 'ios', 'macos', 'android-build', 'android', 'harmony']) assert.ok(suites[name], `CI suite is missing: ${name}`);
  for (const [suite, platform] of [['ios', 'ios'], ['android-build', 'android']]) {
    assert.ok(suites[suite].some(step => step.includes('scripts/test-native-icons.mjs') && step.at(-1) === platform), `Native icon compilation is missing from ${suite}`);
  }
  for (const file of files('packages/render-web/test').filter(file => file.endsWith('.browser.ts'))) {
    const name = file.split('/').at(-1).replace('.browser.ts', '');
    assert.ok([...browserSuites, ...wasmBrowserSuites].includes(name), `Browser test has no runnable entry: ${name}`);
  }
});

test('Web CI covers JS page behavior without compiler or Wasm prerequisites', () => {
  const steps = suites.web;
  assert.deepEqual(steps[0], ['npm', 'run', 'build:web']);
  assert.ok(!steps.some(step => step.includes('prepare:compiler') || step.includes('build:core:wasm')));
  const scheduled = steps.filter(step => step.includes('scripts/test-web-extensions.mjs')).map(step => step.at(-1));
  assert.deepEqual(scheduled, browserSuites);
  assert.ok(!scheduled.some(name => wasmBrowserSuites.includes(name)));
  for (const name of ['timers', 'accessibility-demo', 'virtual-list', 'text-measurement']) {
    const run = steps.findIndex(step => step.includes('scripts/test-web-extensions.mjs') && step.at(-1) === name);
    assert.ok(run > 0, `${name} must exercise the JS page after the Web build`);
  }
});
