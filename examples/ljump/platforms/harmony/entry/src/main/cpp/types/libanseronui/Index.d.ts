export const version: () => number;
export const open: (callback: (message: string) => void) => number;
export const post: (worker: number, message: string, motionKey: string, sequence: number) => number;
export const close: (worker: number) => void;
export const mount: (content: Object, callback: (event: Object) => void, media: Object, density: number) => number;
export const commit: (surface: number, message: string) => void;
export const unmount: (surface: number) => void;
export const supportsModule: (module: string, method: string) => boolean;
export const invokeModule: (module: string, method: string, args: string) => Promise<Object | null>;

export const invokeView: (surface: number, node: number, method: string, args: string) => Object | null;
export const appearance: (surface: number, dark: boolean) => void;

export const mediaEvent: (surface: number, node: number, event: string) => void;

export const visibility: (surface: number, visible: boolean) => void;

export const profile: (worker: number, enabled: boolean, reset: boolean) => void;
export const performance: (worker: number) => Record<string, number>;
