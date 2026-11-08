import { ReferenceRuntime } from '@anseronui/core';
import type { Envelope, InputPayload } from '@anseronui/protocol';
import { counterPage } from '../../../examples/counter/page.js';
import { asyncFormPage } from '../../../examples/async-form/page.js';
let runtime: ReferenceRuntime | null = null;
export function create(): void { if (runtime !== null) throw new Error('RUNTIME_ALREADY_CREATED'); runtime = new ReferenceRuntime({bundleBuildId:'anseronui-demo', pages:[counterPage, asyncFormPage]}); }
export function post(input: string): void { if (runtime === null) throw new Error('RUNTIME_NOT_CREATED'); runtime.post(JSON.parse(input) as Envelope<InputPayload>); }
export function step(): string { return JSON.stringify(runtime?.step(1) ?? []); }
export function pending(): boolean { return runtime?.hasPendingWork() ?? false; }
export function dispose(): void { runtime?.dispose(); runtime=null; }
