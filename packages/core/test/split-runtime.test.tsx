import { expect, it } from 'vitest';
import { BusinessRuntime } from '../src/business-runtime.js';
import { render } from '../src/kernel.js';
import { CORE_ABI_VERSION } from '../src/contracts.js';
import { definePage, View } from '@anseronui/ui';

it('independent business and core exchange only serializable versioned messages', () => {
  const runtime = new BusinessRuntime({bundleBuildId:'split', pages:[definePage('home', () => <View style={{width:50,height:30}} />)]});
  runtime.post({protocolMajor:1,protocolMinor:0,bundleBuildId:'split',runtimeEpoch:1,surfaceId:1,surfaceGeneration:1,sequence:1,ackSequence:0,payload:{type:'CreateSurface',page:'home',width:100,height:100}});
  expect(runtime.step()).toEqual([]);
  const request = runtime.takeCoreRequest()!;
  expect(request.abi).toBe(CORE_ABI_VERSION);
  const result = render(JSON.parse(JSON.stringify(request)));
  expect(result.frames[0].frame).toEqual({x:0,y:0,width:50,height:30});
  expect(() => render({...request,abi:99})).toThrow('CORE_ABI_MISMATCH');
  expect(() => runtime.acceptCoreResult({...result,abi:99})).toThrow('CORE_ABI_MISMATCH');
  runtime.acceptCoreResult({...result,generation:2});
  expect(runtime.takeOutputs()).toEqual([]);
  runtime.acceptCoreResult(JSON.parse(JSON.stringify(result)));
  expect(runtime.takeOutputs()[0].payload.type).toBe('Commit');
  runtime.acceptCoreResult(result);
  expect(runtime.takeOutputs()).toEqual([]);
  runtime.dispose();
  runtime.acceptCoreResult(result);
  expect(runtime.takeOutputs()).toEqual([]);
});
