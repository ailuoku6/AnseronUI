import { expect, it } from 'vitest';
import ts from 'typescript';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import * as ui from '@anseronui/ui';
import * as jsx from '../../ui/src/jsx-runtime.js';
import { TestHost } from '../../core/test/host-harness.js';
import { createCompileProgram, lowerTSX } from '../src/index.js';

function compile(source: string, optimize = true, devtools = false) {
  const dir = mkdtempSync(join(tmpdir(), 'anseronui-template-')), file = join(dir, 'page.tsx');
  writeFileSync(file, source);
  try {
    const program = createCompileProgram([file], { baseUrl: resolve('.'), paths: { '@anseronui/ui': ['packages/ui/src/index.ts'] } });
    const result = lowerTSX(source, file, { program, optimize, devtools });
    expect(result.diagnostics).toEqual([]);
    const js = ts.transpileModule(result.source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    const exports: { [key: string]: any } = {};
    new Function('require', 'exports', js)((name: string) => name.endsWith('jsx-runtime') ? jsx : ui, exports);
    return { ...result, exports };
  } finally { rmSync(dir, { recursive: true }); }
}
it('lowers JSX inside an inline page factory with devtools instrumentation', async () => {
  const result = compile(`import { View, Text, definePage, useState } from '@anseronui/ui';
    function Leaf({index}:{index:number}) { const [n,set]=useState(0); return <Text onClick={()=>set(n+1)}>{index}:{n}</Text>; }
    function mounted(count:number) { return definePage('factory',()=> <View>{Array.from({length:count},(_,index)=><Leaf key={index} index={index}/>)}</View>); }
    export const page=mounted(3);`, true, true);
  expect(result.source).not.toMatch(/<View>|<Leaf/);
  const host = new TestHost(result.exports.page); await host.mount('factory');
  const id = [...host.nodes].find(([,node]) => node.kind === 'Text')![0];
  host.send({type:'Tap', nodeId:id, revision:host.revision}); await host.settle();
  expect(host.nodes.get(id)?.props.text).toBe('0:1'); host.runtime.dispose();
});
it('executes real Program lowering with constant work across a static host template', async () => {
  const source = `import { View, Text, definePage, useState } from '@anseronui/ui';
    export let update: (v: number) => void;
    function Page() { const [opacity, set] = useState(1); update = set;
      return <View style={{opacity}}>${'<Text>固定文字</Text>'.repeat(1000)}</View>; }
    export const page = definePage('template', Page);`;
  const lowered = compile(source);
  expect(lowered.optimizations.filter(r => r.mode === 'template')).toEqual([expect.objectContaining({ nodes: 1001, slots: 1 })]);
  const host = new TestHost(lowered.exports.page); await host.mount('template');
  const before = host.runtime.getStats(); lowered.exports.update(0.5); const outputs = await host.settle(), after = host.runtime.getStats();
  expect(outputs.filter(p => p.type === 'Commit')[0].commands).toEqual([{ type: 'PatchProps', nodeId: 1, set: { opacity: 0.5 }, unset: [] }]);
  expect(after.reconciledNodes - before.reconciledNodes).toBe(1);
  expect(after.dynamicSlotsChecked - (before.dynamicSlotsChecked ?? 0)).toBe(1);
  expect(after.scopeVisits - before.scopeVisits).toBe(2);
  host.runtime.dispose();
}, 20000);
it('keeps JSX escape and custom calls on the normal path, recognizes import aliases by symbol', () => {
  const escaped = compile(`import { View, definePage } from '@anseronui/ui';
    function Page() { return <View />; } export const saved = Page(); export const page = definePage('escaped', Page);`);
  expect(escaped.source).not.toContain('__anseronuiPlan');
  const alias = compile(`import { View as Box, definePage } from '@anseronui/ui';
    function Page() { return <Box />; } export const page = definePage('alias', Page);`);
  expect(alias.optimizations[0].mode).toBe('template');
});
it('preserves closure capture, same-value evaluation and effect obligations under lowering', async () => {
  const source = `import { View, Text, definePage, useState, useEffect } from '@anseronui/ui';
    export let set: (v: number) => void; export let calls: number[] = [];
    function Page() { const [n, update] = useState(0); set = update; useEffect(() => { calls.push(n); });
      return <View onClick={() => calls.push(n)}><Text>{n}</Text></View>; }
    export const page = definePage('semantics', Page);`;
  for (const optimize of [false, true]) {
    const result = compile(source, optimize), host = new TestHost(result.exports.page);
    await host.mount('semantics'); result.exports.set(1); await host.settle(); result.exports.set(1); await host.settle();
    host.send({ type: 'Tap', nodeId: 1, revision: host.revision }); await host.settle();
    expect(result.exports.calls).toEqual([0, 1, 1, 1]); host.runtime.dispose();
  }
});

it('preserves keyed lists and same-position component state inside structural template slots', async () => {
  const source = `import { View, Text, definePage, useState, useEffect } from '@anseronui/ui';
    export let toggle: (v:boolean)=>void; export let child:(v:number)=>void; export let mounts=0;
    function Counter({label}:{label:string}) { const [n,set]=useState(0); child=set; useEffect(()=>{mounts++},[]); return <Text>{label}:{n}</Text>; }
    function Page() { const [flag,set]=useState(false); toggle=set; return <View><Text>static</Text><View>{flag ? <Counter label="a"/> : <Counter label="b"/>}</View></View>; }
    export const page=definePage('structure',Page);`;
  for (const optimize of [false, true]) {
    const result=compile(source,optimize), host=new TestHost(result.exports.page); await host.mount('structure');
    result.exports.child(7); result.exports.toggle(true); await host.settle();
    expect([...host.nodes.values()].filter(n=>n.kind==='Text').map(n=>n.props.text)).toEqual(['static','a:7']);
    expect(result.exports.mounts).toBe(1);
    if (optimize) expect(result.optimizations.some(r=>r.mode==='template')).toBe(true);
    host.runtime.dispose();
  }
}, 20000);
