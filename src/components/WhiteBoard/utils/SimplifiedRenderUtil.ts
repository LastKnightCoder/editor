import { Descendant } from "slate";
import { getEditorText } from "@/utils/editor";

const SIMPLIFIED_FONT_SIZE = 16;
const SIMPLIFIED_LINE_HEIGHT_RATIO = 1.3;
const AVG_CHARS_PER_LINE = 10;

class SimplifiedRenderUtil {
  private static getRenderMeta(height: number, zoom: number) {
    const fontSize = SIMPLIFIED_FONT_SIZE / Math.max(zoom, 0.01);
    const lineHeightPx = fontSize * SIMPLIFIED_LINE_HEIGHT_RATIO;
    const maxLines = Math.max(1, Math.floor(height / lineHeightPx));
    const maxChars = Math.max(
      AVG_CHARS_PER_LINE,
      maxLines * AVG_CHARS_PER_LINE,
    );

    return {
      fontSize,
      lineHeight: SIMPLIFIED_LINE_HEIGHT_RATIO,
      maxLines,
      maxChars,
    };
  }

  static getSimplifiedContent(
    content: Descendant[],
    height: number,
    zoom: number,
  ): {
    text: string;
    fontSize: number;
    lineHeight: number;
    maxLines: number;
  } {
    const { fontSize, lineHeight, maxLines, maxChars } = this.getRenderMeta(
      height,
      zoom,
    );
    const text = getEditorText(content, maxChars);

    return {
      text,
      fontSize,
      lineHeight,
      maxLines,
    };
  }
}

export default SimplifiedRenderUtil;
