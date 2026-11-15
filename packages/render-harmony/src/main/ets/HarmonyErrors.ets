import { BusinessError } from '@kit.BasicServicesKit';
/** Preserve portable service codes; SDK failures otherwise stringify to [object Object]. */
export function serviceError(value: Object): string {
  const failure = value as BusinessError;
  const message = failure.message || String(value);
  if (['UNSUPPORTED','PERMISSION_DENIED','CANCELLED','TIMEOUT','INVALID_ARGUMENT','IO_ERROR'].some(code => message.includes(code))) return message;
  const code = failure.code;
  if (code === 1700002) return 'IO_ERROR: 1700002 reminder quota unavailable; verify agent-powered reminder entitlement and pending reminder quota';
  const category = code === 201 || code === 202 || code === 1700001 ? 'PERMISSION_DENIED' : code === 801 ? 'UNSUPPORTED' : code === 401 ? 'INVALID_ARGUMENT' : 'IO_ERROR';
  return category + ': ' + (code ? String(code) + ' ' : '') + message;
}
