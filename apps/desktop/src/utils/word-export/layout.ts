import {
  AlignmentType,
  BorderStyle,
  HeadingLevel,
  LevelFormat,
  LevelSuffix,
  LineRuleType,
  Paragraph,
  TabStopType,
  Table,
  TableBorders,
  TableLayoutType,
  TableCell,
  TableRow,
  WidthType,
  type ILevelsOptions,
  type IParagraphOptions,
  type IStylesOptions,
  type IRunStylePropertiesOptions,
} from "docx";
import type { WindowFont } from "../../../shared/window-font";

import {
  getInlinePaletteEntry,
  HIGHLIGHT_MIX,
} from "@tau/editor/extensions/text-formatting/palette";

/** Word 的字符底纹使用不透明 RGB，按浅色纸面合成。 */
export function wordHighlight(color: string): IRunStylePropertiesOptions {
  const ink = getInlinePaletteEntry(color)?.light ?? getInlinePaletteEntry("yellow")?.light;
  if (!ink) return {};
  const opacity = HIGHLIGHT_MIX.light.background / 100;
  const fill = [1, 3, 5]
    .map(start => {
      const channel = parseInt(ink.slice(start, start + 2), 16);
      return Math.round(255 + (channel - 255) * opacity)
        .toString(16)
        .padStart(2, "0");
    })
    .join("")
    .toUpperCase();
  return { shading: { fill } };
}

export const page = {
  size: { width: 11906, height: 16838 },
  margin: { top: 1134, bottom: 1134, left: 1332, right: 1332 },
};
export const textWidth = page.size.width - page.margin.left - page.margin.right;
export const headings = [
  HeadingLevel.HEADING_1,
  HeadingLevel.HEADING_2,
  HeadingLevel.HEADING_3,
  HeadingLevel.HEADING_4,
  HeadingLevel.HEADING_5,
  HeadingLevel.HEADING_6,
];
const headingAfterPoints: Record<string, number> = {
  [HeadingLevel.TITLE]: 8,
  [HeadingLevel.HEADING_1]: 10,
  [HeadingLevel.HEADING_2]: 12,
  [HeadingLevel.HEADING_3]: 8,
  [HeadingLevel.HEADING_4]: 3,
  [HeadingLevel.HEADING_5]: 3,
  [HeadingLevel.HEADING_6]: 3,
};
export const bodyAfter = 320;
export const panelParagraphGap = 160;
export const cellParagraphGap = 80;

export type WordBlock =
  | Table
  | (IParagraphOptions & {
      standaloneImage?: boolean;
      startsList?: boolean;
      endsList?: boolean;
      listContinuation?: boolean;
      sectionLabel?: boolean;
    });

/** 用独立间隔统一相邻块的留白，避免阅读器折叠列表段距，或与表格间距相加。 */
function boundarySpacing(
  left: WordBlock | undefined,
  right: WordBlock | undefined,
  paragraphGap: number
): number {
  if (!left || !right) return 0;
  if (
    left instanceof Table ||
    right instanceof Table ||
    left.standaloneImage ||
    right.standaloneImage
  )
    return 255;
  if (left.sectionLabel || (right.listContinuation && (left.numbering || left.listContinuation)))
    return panelParagraphGap;
  if (right.startsList && !left.numbering) {
    return paragraphGap && paragraphGap < bodyAfter ? paragraphGap : left.heading ? 240 : 360;
  }
  if (left.endsList && !right.numbering && !right.heading) return paragraphGap;

  if (
    paragraphGap > 0 &&
    !right.heading &&
    !right.numbering &&
    !right.listContinuation &&
    !left.numbering &&
    !left.listContinuation
  ) {
    return left.heading ? headingAfterPoints[left.heading] * 20 : paragraphGap;
  }
  return 0;
}

export function layoutBlocks(blocks: WordBlock[], paragraphGap = 0): (Paragraph | Table)[] {
  const result: (Paragraph | Table)[] = [];
  for (const [index, block] of blocks.entries()) {
    const previous = blocks[index - 1];
    const next = blocks[index + 1];
    const before = boundarySpacing(previous, block, paragraphGap);
    const after = boundarySpacing(block, next, paragraphGap);
    if (before) {
      result.push(
        new Paragraph({
          spacing: { before: 0, after: 0, line: before, lineRule: LineRuleType.EXACT },
          keepNext: true,
        })
      );
    }
    if (block instanceof Table) result.push(block);
    else {
      result.push(
        new Paragraph({
          ...block,
          spacing: {
            ...block.spacing,
            ...(block.standaloneImage || before ? { before: 0 } : {}),
            ...((block.endsList && !next) || block.standaloneImage || after ? { after: 0 } : {}),
          },
        })
      );
    }
  }
  return result;
}

export function fixedTable(width: number, columnWidths: number[], left = 0) {
  return {
    width: { size: width, type: WidthType.DXA },
    columnWidths,
    layout: TableLayoutType.FIXED,
    alignment: AlignmentType.LEFT,
    indent: { size: left, type: WidthType.DXA },
    margins: { left: 0, right: 0 },
  };
}

export function wordStyles(font: WindowFont): IStylesOptions {
  const size = font.fontSize * 0.75;
  const run = {
    size: Math.round(size * 2),
    font: {
      ascii: font.englishFont || "Arial",
      hAnsi: font.englishFont || "Arial",
      eastAsia: font.chineseFont || "Microsoft YaHei",
    },
    color: "262626",
  };
  const heading = (scale: number, before: number, level: string) => ({
    run: { ...run, size: Math.round(size * scale * 2), bold: true, color: "171717" },
    paragraph: {
      keepNext: true,
      keepLines: true,
      spacing: {
        before: before * 20,
        after: headingAfterPoints[level] * 20,
        line: Math.round(size * scale * 25),
        lineRule: LineRuleType.AT_LEAST,
      },
    },
  });
  return {
    default: {
      document: {
        run,
        paragraph: {
          spacing: {
            after: bodyAfter,
            line: Math.round(size * 36),
            lineRule: LineRuleType.AT_LEAST,
          },
        },
      },
      title: heading(2, 0, HeadingLevel.TITLE),
      heading1: heading(2, 16, HeadingLevel.HEADING_1),
      heading2: heading(1.75, 14, HeadingLevel.HEADING_2),
      heading3: heading(1.5, 9, HeadingLevel.HEADING_3),
      heading4: heading(1.25, 8, HeadingLevel.HEADING_4),
      heading5: heading(1.125, 7, HeadingLevel.HEADING_5),
      heading6: heading(1, 6, HeadingLevel.HEADING_6),
    },
  };
}

export function listTextIndent(ordered: boolean, level: number) {
  return (ordered ? 680 : 400) + level * 400;
}

export function listLevels(ordered: boolean, origin = 0): ILevelsOptions[] {
  return Array.from({ length: 9 }, (_, level) => {
    const left = origin + listTextIndent(ordered, level);
    return {
      level,
      format: ordered ? LevelFormat.DECIMAL : LevelFormat.BULLET,
      text: ordered ? `%${level + 1}.` : ["•", "◦", "▪"][level % 3],
      alignment: ordered ? AlignmentType.RIGHT : AlignmentType.LEFT,
      suffix: LevelSuffix.TAB,
      style: {
        paragraph: {
          indent: { left, hanging: ordered ? 200 : 325 },
          tabStops: [{ type: TabStopType.NUM, position: left }],
        },
      },
    };
  });
}

export const panelInset = 270;

export function panel(
  children: (Paragraph | Table)[],
  fill: string,
  padding: { top: number; bottom: number; right?: number },
  width: number,
  left = 0
): Table {
  return new Table({
    ...fixedTable(width, [width], left),
    borders: TableBorders.NONE,
    rows: [
      new TableRow({
        children: [
          new TableCell({
            children,
            width: { size: width, type: WidthType.DXA },
            shading: { fill },
            margins: {
              top: padding.top,
              bottom: padding.bottom,
              left: 0,
              right: padding.right ?? panelInset,
            },
          }),
        ],
      }),
    ],
  });
}

export const gridBorder = { style: BorderStyle.SINGLE, size: 4, color: "CBD1D1" } as const;
