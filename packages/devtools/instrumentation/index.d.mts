export type DebugOptions = {enabled:boolean; platform?:string; endpoint?:string; rewrite?: (source:string, search:string|RegExp, replacement:string, all?:boolean) => string};
export function debugBuildOptions(target:string, env?:Record<string,string|undefined>):DebugOptions;
export function instrumentSource(path:string, source:string, options:DebugOptions):string;
