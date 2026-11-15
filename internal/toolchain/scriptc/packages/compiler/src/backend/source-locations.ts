import type { SrcLoc } from "../ir/ir.js";

export interface SourcePosition {
  file: string;
  line: number;
  column: number;
}

/** Resolve IR's UTF-16 offsets against the exact sources used by the frontend. */
export class SourceLocations {
  private readonly original = new Map<string, { file: string; points: number[][] }>();
  get hasOriginalMaps(): boolean {
    return this.original.size > 0;
  }
  fileName(file: string): string {
    return this.original.get(file)?.file ?? file;
  }
  private readonly starts = new Map<string, number[]>();

  constructor(sources: ReadonlyMap<string, string>) {
    for (const [file, text] of sources) {
      const starts = [0];
      for (let i = 0; i < text.length; i++) {
        const ch = text.charCodeAt(i);
        if (ch === 13 && text.charCodeAt(i + 1) === 10) i++;
        if (ch === 10 || ch === 13 || ch === 0x2028 || ch === 0x2029) starts.push(i + 1);
      }
      this.starts.set(file, starts);
      const marker = "\n//# anseronuiSourceMap=";
      const at = text.lastIndexOf(marker);
      if (at >= 0) {
        const data = JSON.parse(text.slice(at + marker.length)) as {
          version: number;
          file: string;
          points: number[][];
        };
        if (
          data === null ||
          data.version !== 1 ||
          typeof data.file !== "string" ||
          !Array.isArray(data.points)
        )
          throw new Error("Invalid original source map: " + file);
        let previous = -1;
        for (const point of data.points) {
          if (
            !Array.isArray(point) ||
            point.length !== 4 ||
            !point.every(Number.isSafeInteger) ||
            point[0]! <= previous ||
            point[0]! >= at ||
            point[1]! < 0 ||
            point[2]! < 0 ||
            (point[3] !== 0 && point[3] !== 1)
          )
            throw new Error("Invalid original source map position: " + file);
          previous = point[0]!;
        }
        this.original.set(file, data);
      }
    }
  }

  position(loc: SrcLoc): SourcePosition | null {
    const original = this.original.get(loc.file);
    if (original !== undefined) {
      let lo = 0,
        hi = original.points.length - 1;
      if (hi < 0 || loc.start < original.points[0]![0]!) return null;
      while (lo < hi) {
        const mid = (lo + hi + 1) >>> 1;
        if (original.points[mid]![0]! <= loc.start) lo = mid;
        else hi = mid - 1;
      }
      const point = original.points[lo]!;
      return point[1] === 0
        ? null
        : {
            file: original.file,
            line: point[1]!,
            column: point[2]! + (loc.start - point[0]!) * point[3]!,
          };
    }
    const starts = this.starts.get(loc.file);
    if (starts === undefined || loc.start < 0) return null;
    let lo = 0,
      hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >>> 1;
      if (starts[mid]! <= loc.start) lo = mid;
      else hi = mid - 1;
    }
    return { file: loc.file, line: lo + 1, column: loc.start - starts[lo]! + 1 };
  }
}
