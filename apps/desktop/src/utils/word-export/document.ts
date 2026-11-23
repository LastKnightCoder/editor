import {
  AlignmentType,
  Document as WordDocument,
  LineRuleType,
  Packer,
  Paragraph,
  Table,
  TableBorders,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  type IRunOptions,
  type ParagraphChild,
  type INumberingOptions,
  type IParagraphOptions,
} from "docx";
import type { WindowFont } from "../../../shared/window-font";
import {
  layoutBlocks,
  bodyAfter,
  cellParagraphGap,
  panelParagraphGap,
  fixedTable,
  gridBorder,
  headings,
  listLevels,
  listTextIndent,
  page,
  panel,
  panelInset,
  textWidth,
  wordStyles,
  type WordBlock,
} from "./layout";

import {
  blockSelector,
  createInlineWriter,
  prepareStaticHtml,
  type ImageLoader,
} from "./static-html";

type Flow = {
  origin?: number;
  listIndent?: number;
  width: number;
  depth: number;
  paragraph?: IParagraphOptions;
  run?: IRunOptions;
};

class WordBody {
  readonly warnings: string[] = [];
  readonly numbering: Array<INumberingOptions["config"][number]> = [];
  private readonly mono: string;
  private readonly size: number;
  private readonly inlineNodes: ReturnType<typeof createInlineWriter>;

  constructor(font: WindowFont, loadImage: ImageLoader) {
    this.mono = font.codeFont || "Consolas";
    this.size = font.fontSize * 0.75;
    this.inlineNodes = createInlineWriter(loadImage, this.mono, this.size, this.warnings);
  }

  async flow(nodes: ArrayLike<Node>, ctx: Flow): Promise<WordBlock[]> {
    const result: WordBlock[] = [];
    let pending: Node[] = [];
    const flush = async () => {
      if (pending.some(n => n.nodeType === 1 || n.textContent?.trim())) {
        result.push({
          ...ctx.paragraph,
          listContinuation: !!ctx.listIndent,
          standaloneImage:
            pending.some(n => n.nodeType === 1 && (n as Element).matches("img,svg")) &&
            pending.every(n =>
              n.nodeType === 1 ? (n as Element).matches("img,svg,br") : !n.textContent?.trim()
            ),
          children: await this.inlineNodes(pending, ctx.run || {}, ctx.width),
        });
      }
      pending = [];
    };
    for (const n of Array.from(nodes)) {
      if (n.nodeType === 8) continue;
      if (n.nodeType !== 1 || !(n as Element).matches(blockSelector)) {
        pending.push(n);
        continue;
      }
      await flush();
      result.push(...(await this.block(n as Element, ctx)));
    }
    await flush();
    return result;
  }

  private async list(el: Element, ctx: Flow) {
    const items = Array.from(el.children).filter(it => it.localName === "li");
    const ordered = el.localName === "ol";
    const reference = `list-${this.numbering.length}`;
    const level = Math.min(8, ctx.depth);
    const levels = listLevels(ordered, ctx.origin);
    const itemIndent = listTextIndent(ordered, level);
    const start = Number(el.getAttribute("start"));
    if (start > 0) levels[level] = { ...levels[level], start };
    this.numbering.push({ reference, levels });
    const linksOnly =
      items.length > 0 &&
      items.every(
        item =>
          item.querySelector("a") &&
          item.querySelector("a")?.textContent?.trim() === item.textContent?.trim()
      );
    const output: WordBlock[] = [];
    for (const [index, item] of items.entries()) {
      const children = Array.from(item.childNodes).filter(
        n => n.nodeType === 1 || n.textContent?.trim()
      );
      const first = children[0] as Element | undefined;
      const paragraph = first?.localName === "p";
      const startOfBlocks = children.findIndex(
        n => n.nodeType === 1 && (n as Element).matches(blockSelector)
      );
      const count = paragraph ? 1 : startOfBlocks < 0 ? children.length : startOfBlocks;
      const runs = await this.inlineNodes(
        paragraph ? first.childNodes : children.slice(0, count),
        ctx.run || {},
        ctx.width
      );
      if (item.classList.contains("check-list-item"))
        runs.unshift(new TextRun(item.classList.contains("checked") ? "☑ " : "☐ "));
      const rest = children.slice(count);
      const last = index === items.length - 1 && !rest.length;
      output.push({
        startsList: index === 0 && ctx.depth === 0,
        numbering: { reference, level },
        spacing: {
          after: last ? 320 : linksOnly ? 160 : 80,
          line: Math.round(this.size * 32),
          lineRule: LineRuleType.AT_LEAST,
        },
        children: runs,
      });
      output.push(
        ...(await this.flow(rest, {
          ...ctx,
          depth: ctx.depth + 1,
          listIndent: itemIndent,
          paragraph: { indent: { left: (ctx.origin ?? 0) + itemIndent } },
        }))
      );
    }
    const end = output.at(-1);
    if (ctx.depth === 0 && end && !(end instanceof Table)) end.endsList = true;
    return output;
  }

  private async table(el: Element, ctx: Flow) {
    const rows = Array.from((el as HTMLTableElement).rows);
    if (!rows.length) return [];
    const columnCount = Math.max(
      1,
      ...rows.map(row => Array.from(row.cells).reduce((n, c) => n + c.colSpan, 0))
    );
    const columnWidths = Array.from(
      { length: columnCount },
      (_, index) =>
        Math.round(((index + 1) * ctx.width) / columnCount) -
        Math.round((index * ctx.width) / columnCount)
    );
    const result: TableRow[] = [];
    for (const [i, row] of rows.entries()) {
      const cells: TableCell[] = [];
      for (const [index, cell] of Array.from(row.cells).entries()) {
        const left = index === 0 ? 270 : 110;
        const cellWidth = Math.round((ctx.width * cell.colSpan) / columnCount);
        const head = cell.localName === "th" || (i === 0 && el.classList.contains("table"));
        const content = await this.flow(cell.childNodes, {
          ...ctx,
          listIndent: 0,
          origin: left,
          width: Math.max(1, cellWidth - left - 110),
          paragraph: {
            indent: { left, right: 110 },
            spacing: {
              before: 40,
              after: 40,
              line: Math.round(this.size * 24),
              lineRule: LineRuleType.AT_LEAST,
            },
          },
          run: { bold: head, size: Math.round(this.size * 1.7) },
        });
        cells.push(
          new TableCell({
            children: content.length
              ? layoutBlocks(content, cellParagraphGap)
              : [new Paragraph("")],
            columnSpan: cell.colSpan,
            rowSpan: Math.min(cell.rowSpan || rows.length, rows.length - i),
            width: { size: cellWidth, type: WidthType.DXA },
            shading: head ? { fill: "E5EBEB" } : undefined,
          })
        );
      }
      result.push(
        new TableRow({
          children: cells,
          tableHeader:
            i === 0 && (el.classList.contains("table") || row.querySelector("th") !== null),
        })
      );
    }
    return [
      new Table({
        ...fixedTable(ctx.width, columnWidths, ctx.origin),
        margins: { left: 0, right: 0, top: 40, bottom: 40 },
        rows: result,
        borders: {
          top: gridBorder,
          bottom: gridBorder,
          left: gridBorder,
          right: gridBorder,
          insideHorizontal: gridBorder,
          insideVertical: gridBorder,
        },
      }),
    ];
  }

  private panelBounds(ctx: Flow) {
    const left = Math.min(ctx.listIndent ?? 0, Math.max(0, ctx.width - 2 * panelInset - 1));
    return { left: (ctx.origin ?? 0) + left, width: ctx.width - left };
  }

  private async block(el: Element, ctx: Flow): Promise<WordBlock[]> {
    const tag = el.localName;
    if (el.matches(".detail-label,.callout-title")) {
      // 折叠控件周围的 HTML 排版换行不属于作者填写的标题。
      const label = el.querySelector(".detail-title-text") ?? el;
      return [
        {
          ...ctx.paragraph,
          sectionLabel: true,
          keepNext: true,
          children: await this.inlineNodes(label.childNodes, { ...ctx.run, bold: true }, ctx.width),
        },
      ];
    }
    if (el.matches(".block-math") && el.querySelector("svg")) {
      return [
        {
          ...ctx.paragraph,
          alignment: AlignmentType.CENTER,
          standaloneImage: true,
          children: await this.inlineNodes(el.childNodes, ctx.run || {}, ctx.width),
        },
      ];
    }
    if (/^h[1-6]$/.test(tag))
      return [
        {
          indent: ctx.paragraph?.indent,
          heading: headings[Number(tag[1]) - 1],
          children: await this.inlineNodes(el.childNodes, {}, ctx.width),
        },
      ];
    // 静态 HTML 中的等宽图片列在 Word 中用无边框表格保留并排关系。
    const grid = (el as HTMLElement).style;
    if (
      grid?.display === "grid" &&
      el.children.length > 1 &&
      Array.from(el.children).every(child => child.localName === "img") &&
      grid.gridTemplateColumns.trim() === Array.from(el.children, () => "1fr").join(" ")
    ) {
      const width = Math.floor(ctx.width / el.children.length);
      const cells: TableCell[] = [];
      for (const image of Array.from(el.children)) {
        cells.push(
          new TableCell({
            children: [
              new Paragraph({
                spacing: { after: 0, before: 0 },
                alignment: AlignmentType.CENTER,
                children: await this.inlineNodes([image], {}, width - 120),
              }),
            ],
          })
        );
      }
      return [
        new Table({
          ...fixedTable(
            ctx.width,
            cells.map(() => width),
            ctx.origin
          ),
          borders: TableBorders.NONE,
          rows: [new TableRow({ children: cells })],
        }),
      ];
    }
    if (tag === "p" && !el.querySelector(blockSelector))
      return [
        {
          ...ctx.paragraph,
          listContinuation: !!ctx.listIndent,
          standaloneImage: !el.textContent?.trim() && !!el.querySelector("img,svg"),
          children: await this.inlineNodes(el.childNodes, ctx.run || {}, ctx.width),
        },
      ];
    if (tag === "ol" || tag === "ul") return this.list(el, ctx);
    if (tag === "table") return this.table(el, ctx);
    if (tag === "pre") {
      const { left, width } = this.panelBounds(ctx);
      const lines = el.querySelectorAll(":scope > code > .line");
      const style = { font: this.mono, size: Math.round(this.size * 1.6), noProof: true };
      const paragraphs: Paragraph[] = [];
      const addLine = (children: ParagraphChild[]) =>
        paragraphs.push(
          new Paragraph({
            alignment: AlignmentType.LEFT,
            children,
            run: style,
            // 用段落缩进留出代码内边距，避免阅读器按单元格文字起点定位整张表。
            indent: { left: panelInset, right: panelInset },
            spacing: {
              before: 0,
              after: 0,
              line: Math.round(this.size * 28.8),
              lineRule: LineRuleType.AT_LEAST,
            },
          })
        );
      if (lines.length) {
        for (const line of Array.from(lines))
          addLine(await this.inlineNodes(line.childNodes, style, width - 2 * panelInset));
      } else {
        for (const line of (el.textContent || "").split(/\r?\n/))
          addLine([new TextRun({ ...style, text: line })]);
      }
      return [panel(paragraphs, "F4F3F1", { top: 164, bottom: 224, right: 0 }, width, left)];
    }
    if (el.matches(".callout,.highlight-block,blockquote")) {
      const { left, width } = this.panelBounds(ctx);
      const content = await this.flow(el.childNodes, {
        ...ctx,
        listIndent: 0,
        origin: panelInset,
        width: width - 2 * panelInset,
        paragraph: { indent: { left: panelInset }, spacing: { before: 0, after: 0 } },
      });
      return [
        panel(
          content.length ? layoutBlocks(content, panelParagraphGap) : [new Paragraph("")],
          tag === "blockquote" ? "F5F3EF" : "F2F5F5",
          { top: 200, bottom: 200 },
          width,
          left
        ),
      ];
    }
    if (tag === "hr") return [{ border: { bottom: gridBorder } }];
    return this.flow(el.childNodes, ctx);
  }
}

export async function buildWordDocument(
  html: string,
  title: string,
  font: WindowFont,
  loadImage: ImageLoader
) {
  const fragment = prepareStaticHtml(html);
  const body = new WordBody(font, loadImage);
  const children = await body.flow(fragment.childNodes, { width: textWidth, depth: 0 });
  const doc = new WordDocument({
    compatabilityModeVersion: 15,
    compatibility: { doNotExpandShiftReturn: true },
    title,
    styles: wordStyles(font),
    numbering: { config: body.numbering },
    sections: [
      {
        properties: { page },
        children: layoutBlocks([{ heading: "Title", text: title }, ...children], bodyAfter),
      },
    ],
  });
  return { bytes: new Uint8Array(await Packer.toArrayBuffer(doc)), warnings: body.warnings };
}
