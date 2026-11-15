import ts from "typescript";

/** Build-time provenance only. Never included in the application runtime. */
export interface MappedSource {
  source: string;
  original: string;
  file: string;
  offsets: number[];
}
export function originalSource(source: string, file: string): MappedSource {
  return { source, original: source, file: file.replaceAll("\\", "/"), offsets: Array.from({ length: source.length }, (_, i) => i) };
}
function lineStarts(text: string): number[] {
  const starts = [0];
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c === 13 && text.charCodeAt(i + 1) === 10) i++;
    if (c === 10 || c === 13 || c === 0x2028 || c === 0x2029) starts.push(i + 1);
  }
  return starts;
}

/** The pinned TypeScript printer can emit maps without erasing TypeScript types. */
export function printMapped(file: ts.SourceFile, input: MappedSource): MappedSource {
  // These printer APIs are internal in TS 5.9; keep this adapter isolated and tested.
  const api = ts as unknown as {
    createTextWriter(newline: string): { getText(): string };
    createSourceMapGenerator(host: object, file: string, root: string, directory: string, options: object): { toJSON(): { mappings: string } };
  };
  const writer = api.createTextWriter("\n");
  const map = api.createSourceMapGenerator({ getCurrentDirectory: () => "", getCanonicalFileName: (x: string) => x }, file.fileName, "", "", {});
  const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed }) as ts.Printer & { writeFile(file: ts.SourceFile, writer: unknown, map: unknown): void };
  printer.writeFile(file, writer, map);
  const source = writer.getText();
  const starts = lineStarts(source), previousStarts = lineStarts(input.source);
  const offsets = new Array<number>(source.length).fill(-1);
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let sourceIndex = 0, sourceLine = 0, sourceColumn = 0;
  for (const [line, encoded] of map.toJSON().mappings.split(";").entries()) {
    let column = 0;
    const segments: Array<[number, number]> = [];
    for (const segment of encoded.split(",")) {
      if (!segment) continue;
      const values: number[] = [];
      let value = 0, shift = 0;
      for (const char of segment) {
        const digit = alphabet.indexOf(char);
        if (digit < 0) throw new Error("Invalid printer source map");
        value += (digit & 31) * 2 ** shift;
        if (digit & 32) shift += 5;
        else { values.push(value & 1 ? -(value >>> 1) : value >>> 1); value = 0; shift = 0; }
      }
      column += values[0];
      let original = -1;
      if (values.length >= 4) {
        sourceIndex += values[1]; sourceLine += values[2]; sourceColumn += values[3];
        if (sourceIndex === 0) original = input.offsets[(previousStarts[sourceLine] ?? input.source.length) + sourceColumn] ?? -1;
      }
      segments.push([column, original]);
    }
    const start = starts[line];
    if (start === undefined) continue;
    for (let i = 0; i < segments.length; i++) {
      const [column, original] = segments[i];
      const end = i + 1 < segments.length ? start + segments[i + 1][0] : (starts[line + 1] ?? source.length);
      offsets.fill(original, start + column, end);
    }
  }
  return { ...input, source, offsets };
}

/** Apply explicit edits, retaining unchanged provenance and marking inserted code as generated. */
export function replaceMapped(input: MappedSource, search: string | RegExp, replacement: string, all = false): MappedSource {
  const edits: Array<{ start: number; end: number; text: string }> = [];
  const collect = (...args: unknown[]): string => {
    const match = args[0] as string;
    const start = args[args.length - 2] as number;
    const text = replacement.replace(/\$(\d+|\$|&)/g, (_, key: string) => key === "$" ? "$" : key === "&" ? match : String(args[Number(key)] ?? ""));
    edits.push({ start, end: start + match.length, text });
    return text;
  };
  const source = all ? input.source.replaceAll(search, collect) : input.source.replace(search, collect);
  const offsets: number[] = [];
  let cursor = 0;
  for (const edit of edits) {
    for (let i = cursor; i < edit.start; i++) offsets.push(input.offsets[i]);
    // A rewrite has the source position of the replaced token; wholly inserted code has none.
    const old = input.source.slice(edit.start, edit.end);
    let prefix = 0, suffix = 0;
    while (prefix < old.length && prefix < edit.text.length && old[prefix] === edit.text[prefix]) prefix++;
    while (suffix < old.length - prefix && suffix < edit.text.length - prefix && old[old.length - suffix - 1] === edit.text[edit.text.length - suffix - 1]) suffix++;
    for (let i = 0; i < edit.text.length; i++) offsets.push(i < prefix ? input.offsets[edit.start + i] : i >= edit.text.length - suffix ? input.offsets[edit.end - (edit.text.length - i)] : edit.start === edit.end || prefix + suffix === old.length ? -1 : input.offsets[edit.start + prefix]);
    cursor = edit.end;
  }
  for (let i = cursor; i < input.source.length; i++) offsets.push(input.offsets[i]);
  return { ...input, source, offsets };
}

/** Compact compiler input: generated UTF-16 offset -> original file, 1-based line/column. */
export function sourceMapComment(input: MappedSource): string {
  const starts = lineStarts(input.original);
  const points: number[][] = [];
  for (let i = 0; i < input.offsets.length;) {
    const offset = input.offsets[i];
    if (offset < 0) {
      points.push([i, 0, 0, 0]);
      do { i++; } while (i < input.offsets.length && input.offsets[i] < 0);
      continue;
    }
    let lo = 0, hi = starts.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >>> 1; if (starts[mid] <= offset) lo = mid; else hi = mid - 1; }
    const step = input.offsets[i + 1] === offset + 1 ? 1 : 0;
    points.push([i, lo + 1, offset - starts[lo] + 1, step]);
    const first = i++;
    while (i < input.offsets.length && input.offsets[i] === offset + (i - first) * step && input.offsets[i] < (starts[lo + 1] ?? input.original.length)) i++;
  }
  return "\n//# anseronuiSourceMap=" + JSON.stringify({ version: 1, file: input.file, points }) + "\n";
}
