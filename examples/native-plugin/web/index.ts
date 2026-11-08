import type { PlatformExtensions } from 'anseronui/render-web';

export function createExtensions(): PlatformExtensions {
  return { modules: {
    'example.device'(method) {
      if (method !== 'info') throw new Error('UNSUPPORTED_METHOD: ' + method);
      return { platform: 'Web', version: navigator.userAgent };
    },
  } };
}
