import type { Style } from "./index.js";

/** The typography supported by Text. Box styles do not affect this measurement. */
export type TextMeasureStyle = Pick<Style, "fontSize" | "fontWeight" | "fontStyle" | "lineHeight">;
export interface MeasureTextOptions {
  text: string;
  style?: TextMeasureStyle;
  /** Maximum content width in layout units. Defaults to 100000. */
  maxWidth?: number;
  /** Clips the measured height; does not change line wrapping. */
  maxHeight?: number;
  /** Omitted or 0 measures all lines. */
  numberOfLines?: number;
  ellipsizeMode?: "tail" | "clip";
}
/** Content size in layout units, without padding, borders, margins or transforms. */
export interface TextSize { width: number; height: number }
export type TextMeasurer = (options: MeasureTextOptions) => Promise<TextSize>;

/** Shared validation before sending any work to the platform renderer. */
export function prepareTextMeasurement(options: MeasureTextOptions): {
  text: string; fontSize: number; maxWidth: number; maxHeight?: number;
  props: { fontWeight: "normal" | "bold"; fontStyle: "normal" | "italic"; lineHeight?: number; numberOfLines: number; ellipsizeMode: "tail" | "clip" };
} {
  if (!options || typeof options.text !== "string" || options.text.length > 65536) throw new Error("INVALID_TEXT_MEASUREMENT");
  const style = options.style ?? {};
  const fontSize = style.fontSize ?? 16;
  const maxWidth = options.maxWidth ?? 100000;
  const maxHeight = options.maxHeight;
  const numberOfLines = options.numberOfLines ?? 0;
  const fontWeight = style.fontWeight ?? "normal", fontStyle = style.fontStyle ?? "normal";
  const ellipsizeMode = options.ellipsizeMode ?? "tail";
  if (!Number.isFinite(fontSize) || fontSize <= 0 || !Number.isFinite(maxWidth) || maxWidth < 0 ||
      (maxHeight !== undefined && (!Number.isFinite(maxHeight) || maxHeight < 0)) ||
      (style.lineHeight !== undefined && (!Number.isFinite(style.lineHeight) || style.lineHeight <= 0)) ||
      !Number.isInteger(numberOfLines) || numberOfLines < 0 || numberOfLines > 0xffffffff ||
      (fontWeight !== "normal" && fontWeight !== "bold") || (fontStyle !== "normal" && fontStyle !== "italic") ||
      (ellipsizeMode !== "tail" && ellipsizeMode !== "clip")) throw new Error("INVALID_TEXT_MEASUREMENT");
  const props: { fontWeight: "normal" | "bold"; fontStyle: "normal" | "italic"; lineHeight?: number; numberOfLines: number; ellipsizeMode: "tail" | "clip" } = {
    fontWeight, fontStyle, numberOfLines, ellipsizeMode,
  };
  if (style.lineHeight !== undefined) props.lineHeight = style.lineHeight;
  return { text: options.text, fontSize, maxWidth, maxHeight, props };
}
