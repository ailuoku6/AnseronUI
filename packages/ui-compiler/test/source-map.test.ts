import { expect, test } from 'vitest';
import { lowerTSX } from '../src/index.js';
import { originalSource, replaceMapped, sourceMapComment } from '../src/source-map.js';
// @ts-expect-error Build scripts are JavaScript and run through the pinned tsx loader.
import { lowerTimers } from '../../../scripts/lower-timers.mjs';
import { instrumentSource } from '../../devtools/instrumentation/index.mjs';
import { SourceLocations } from '../../../internal/toolchain/scriptc/packages/compiler/src/backend/source-locations.js';

test('composes TSX, timer lowering, debug imports and alias edits back to original Unicode TSX', () => {
  const source = 'import { View } from "anseronui";\r\n// 中文 😀\r\nexport function Page() {\r\n  setTimeout(() => { console.error("before"); throw new Error("origin"); }, 1);\r\n  return <View />;\r\n}\r\n';
  const originalOffset = source.indexOf('new Error');
  const before = source.slice(0, originalOffset).split('\n');
  let mapped = lowerTSX(source, 'pages/订单.tsx', { devtools:true }).mapped;
  mapped = lowerTimers(mapped.source, 'staged.ts', mapped);
  const rewrite = (text: string, search: string | RegExp, replacement: string, all = false) => {
    expect(text).toBe(mapped.source);
    mapped = replaceMapped(mapped, search, replacement, all);
    return mapped.source;
  };
  instrumentSource('pages/订单.tsx', mapped.source, { enabled:true, rewrite });
  mapped = replaceMapped(mapped, /^/, 'import { __anseronuiDevtoolsLog } from "./log.js";\n');
  mapped = replaceMapped(mapped, '"anseronui"', '"../../packages/ui/index.js"', true);
  const text = mapped.source + sourceMapComment(mapped);
  const positions = new SourceLocations(new Map([['staged.ts', text]]));
  expect(positions.position({ file:'staged.ts', start:mapped.source.indexOf('new Error'), end:0 })).toEqual({ file:'pages/订单.tsx', line:before.length, column:before.at(-1)!.length + 1 });
  expect(positions.position({ file:'staged.ts', start:0, end:0 })).toBeNull();
});

test('identity maps preserve positions while inserted text is explicitly unmapped', () => {
  const original = 'const n = 1;\nthrow new Error("x");\n';
  let mapped = originalSource(original, 'src/main.ts');
  mapped = replaceMapped(mapped, /^/, '// inserted\n');
  const positions = new SourceLocations(new Map([['out.ts', mapped.source + sourceMapComment(mapped)]]));
  expect(positions.position({ file:'out.ts', start:mapped.source.indexOf('new Error'), end:0 })).toEqual({ file:'src/main.ts', line:2, column:7 });
  expect(positions.position({ file:'out.ts', start:3, end:0 })).toBeNull();
  const changed = replaceMapped(mapped, 'const n = 1;', 'const n = 1;\n// generated');
  expect(changed.offsets[changed.source.indexOf('new Error')]).toBe(original.indexOf('new Error'));
});
