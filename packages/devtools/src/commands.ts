import type { DevtoolsCommand } from './protocol.js';
export function commandError(command: DevtoolsCommand): string | undefined {
  if (!command || !['full','sample','state','inspectProps','set','shot','live'].includes(command.type)) return 'UNSUPPORTED_COMMAND';
  if (command.type === 'sample' && (!Number.isInteger(command.value) || Number(command.value) < 100 || Number(command.value) > 5000)) return 'INVALID_INTERVAL';
  if (['state','inspectProps','set','shot'].includes(command.type) && !Number.isSafeInteger(command.id)) return 'INVALID_NODE_ID';
  if (['shot','live'].includes(command.type) && command.sample !== undefined && ![1,2].includes(command.sample)) return 'INVALID_SAMPLE';
  if (command.type === 'live' && typeof command.on !== 'boolean') return 'INVALID_LIVE';
  if (command.type === 'set') {
    if (!['p','s'].includes(command.target ?? '') || typeof command.key !== 'string' || !command.key || ['__proto__','constructor','prototype','children','ref','name','nativeProps'].includes(command.key) || command.key.startsWith('on')) return 'READ_ONLY_FIELD';
    if (command.value === undefined || JSON.stringify(command.value).length > 4096) return 'INVALID_VALUE';
  }
}
