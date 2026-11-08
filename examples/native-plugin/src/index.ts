import { useServices } from 'anseronui/ui';

export interface DeviceInfo { platform: string; version: string }

/** Call this hook inside a function component, then call device.info() in an event/effect. */
export function useDevice() {
  const services = useServices();
  return {
    info(): Promise<DeviceInfo> {
      return services.invoke<DeviceInfo>('example.device', 'info');
    },
  };
}
