import type { Descendant } from "slate";
import type { MarkdownCodec } from "@tau/markdown";
import type { TableAlign } from "./align";

const isNonBlank = (value: string): boolean => value.trim().length > 0;

const SEPARATOR: Record<NonNullable<TableAlign> | "none", string> = {
  none: "---",
  left: ":---",
  center: ":---:",
  right: "---:",
};

type AlignedTable = { align?: TableAlign[]; children?: Array<{ children?: unknown[] }> };

const buildSimpleTable = (rows: string[], table: AlignedTable): string => {
  if (rows.length === 0) return "";
  const align = table.align ?? [];
  const cellCount = table.children?.[0]?.children?.length ?? 0;
  const separator = `| ${Array.from({ length: cellCount }, (_, i) => SEPARATOR[align[i] ?? "none"]).join(" | ")} |`;
  return [rows[0], separator, ...rows.slice(1)].join("\n");
};

const isAlign = (value: unknown): value is TableAlign =>
  value === null || value === "left" || value === "center" || value === "right";

const importAlign = (value: unknown): TableAlign[] | undefined => {
  if (!Array.isArray(value)) return;
  const align = value.map(item => (isAlign(item) ? item : null));
  return align.some(item => item !== null) ? align : undefined;
};

export const tableCodec: MarkdownCodec = {
  type: "table",
  childSeparator: "\n",
  importNode: node => {
    if (node.type !== "table") return null;
    const align = importAlign(node.align);
    return { type: "table", children: [], ...(align ? { align } : {}) } as unknown as Descendant;
  },
  serializer: {
    isBlock: true,
    toMarkdown: (element, children) =>
      buildSimpleTable(children.split("\n").filter(isNonBlank), element as AlignedTable),
    toMarkdownStructured: (element, children) => {
      const rows = children.split("\n").filter(isNonBlank);
      if (rows.length === 0) {
        return { output: "" };
      }
      return {
        output: buildSimpleTable(rows, element as AlignedTable),
        childLineShifts: rows.length > 1 ? [{ startIndex: 1, lineDelta: 1 }] : [],
      };
    },
  },
};

export const tableRowCodec: MarkdownCodec = {
  type: "table-row",
  importNode: node =>
    node.type === "tableRow"
      ? ({ type: "table-row", children: [] } as unknown as Descendant)
      : null,
  serializer: {
    isBlock: true,
    toMarkdown: (_element, children) => `| ${children.split("\n").join("")}`.trim(),
    toMarkdownStructured: (_element, children) => ({
      output: `| ${children.split("\n").join("")}`.trim(),
      childrenStart: { line: 0, ch: 2 },
    }),
  },
};

const BR = /^<br\s*\/?>$/i;

/** 格内内容进 GFM 表格行：竖线转义、格内换行写成 <br> */
const cellMarkdown = (children: string) =>
  children
    .trim()
    .replace(/(?<!\\)\|/g, "\\|")
    .replace(/\n/g, "<br>");

export const tableCellCodec: MarkdownCodec = {
  type: "table-cell",
  importNode: (node, context) => {
    if (node.type === "tableCell")
      return { type: "table-cell", children: [] } as unknown as Descendant;
    // 格内 <br> 还原为软换行
    if (
      node.type === "html" &&
      context.parent?.type === "tableCell" &&
      BR.test(String(node.value ?? "").trim())
    ) {
      return { type: "formatted", text: "\n" } as unknown as Descendant;
    }
    return null;
  },
  serializer: {
    toMarkdown: (_element, children) => `${cellMarkdown(children)} | `,
    toMarkdownStructured: (_element, children) => ({
      output: `${cellMarkdown(children)} | `,
      childrenStart: { line: 0, ch: 0 },
    }),
  },
};
