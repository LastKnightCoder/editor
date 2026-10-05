import type { Descendant } from "slate";
import type { MarkdownCodec } from "@tau/markdown";
import type { TableAlign } from "./align";

type AlignedTable = { align?: TableAlign[] };

const isNonBlank = (value: string): boolean => value.trim().length > 0;

const SEPARATOR: Record<NonNullable<TableAlign> | "none", string> = {
  none: "---",
  left: ":---",
  center: ":---:",
  right: "---:",
};

const buildSimpleTable = (rows: string[], align: readonly TableAlign[] = []): string => {
  if (rows.length === 0) return "";
  const firstRow = rows[0];
  const pipeCount = firstRow.split("|").length - 1;
  const cellCount = Math.max(pipeCount - 1, 0);
  const separator = `| ${Array.from({ length: cellCount }, (_, i) => SEPARATOR[align[i] ?? "none"]).join(" | ")} |`;
  return [firstRow, separator, ...rows.slice(1)].join("\n");
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
      buildSimpleTable(children.split("\n").filter(isNonBlank), (element as AlignedTable).align),
    toMarkdownStructured: (element, children) => {
      const rows = children.split("\n").filter(isNonBlank);
      if (rows.length === 0) {
        return { output: "" };
      }
      return {
        output: buildSimpleTable(rows, (element as AlignedTable).align),
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

export const tableCellCodec: MarkdownCodec = {
  type: "table-cell",
  importNode: node =>
    node.type === "tableCell"
      ? ({ type: "table-cell", children: [] } as unknown as Descendant)
      : null,
  serializer: {
    toMarkdown: (_element, children) => `${children.trim()} | `,
    toMarkdownStructured: (_element, children) => ({
      output: `${children.trim()} | `,
      childrenStart: { line: 0, ch: 0 },
    }),
  },
};
