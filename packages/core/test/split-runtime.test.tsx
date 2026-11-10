import { expect, it } from 'vitest';
import { BusinessRuntime } from '../src/business-runtime.js';
import { LayoutKernel, render } from '../src/kernel.js';
import { CORE_ABI_VERSION } from '../src/contracts.js';
import { definePage, View } from '@anseronui/ui';

it('independent business and core exchange only serializable versioned messages', () => {
  const runtime = new BusinessRuntime({bundleBuildId:'split', pages:[definePage('home', () => <View style={{width:50,height:30}} />)]});
  runtime.post({protocolMajor:1,protocolMinor:0,bundleBuildId:'split',runtimeEpoch:1,surfaceId:1,surfaceGeneration:1,sequence:1,ackSequence:0,payload:{type:'CreateSurface',page:'home',width:100,height:100}});
  expect(runtime.step()).toEqual([]);
  const request = runtime.takeCoreRequest()!;
  expect(request.abi).toBe(CORE_ABI_VERSION);
  if (request.type !== "Render") throw new Error("Expected render request");
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

it('sends surface release through the serializable bridge and removes queued renders on destruction', () => {
  const core = new LayoutKernel();
  const runtime = new BusinessRuntime({bundleBuildId:'split', pages:[definePage('home', () => <View style={{width:50,height:30}} />)]});
  const send = (payload: import('@anseronui/protocol').InputPayload, sequence: number, generation = 1) => {
    runtime.post({protocolMajor:1,protocolMinor:0,bundleBuildId:'split',runtimeEpoch:1,surfaceId:1,surfaceGeneration:generation,sequence,ackSequence:0,payload});
    runtime.step();
  };
  send({type:'CreateSurface',page:'home',width:100,height:100}, 1);
  const initial = runtime.takeCoreRequest()!;
  const result = core.execute(JSON.parse(JSON.stringify(initial)));
  send({type:'DestroySurface'}, 2);
  const release = runtime.takeCoreRequest()!;
  expect(release).toEqual({type:'ReleaseSurface',abi:CORE_ABI_VERSION,surfaceId:1,generation:1});
  runtime.acceptCoreResult(core.execute(JSON.parse(JSON.stringify(release))));
  runtime.acceptCoreResult(result);
  expect(runtime.takeOutputs()).toEqual([]);
  send({type:'CreateSurface',page:'home',width:200,height:200}, 1, 2);
  // The unprocessed render must disappear when its surface is destroyed.
  send({type:'DestroySurface'}, 2, 2);
  expect(runtime.takeCoreRequest()).toEqual({type:'ReleaseSurface',abi:CORE_ABI_VERSION,surfaceId:1,generation:2});
  expect(runtime.takeCoreRequest()).toBeNull();
  runtime.dispose(); core.dispose();
});
