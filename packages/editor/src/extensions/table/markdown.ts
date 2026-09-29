import type { Descendant } from "slate";
import type { MarkdownCodec } from "@tau/markdown";

const isNonBlank = (value: string): boolean => value.trim().length > 0;

const buildSimpleTable = (rows: string[]): string => {
  if (rows.length === 0) return "";
  const firstRow = rows[0];
  const pipeCount = firstRow.split("|").length - 1;
  const cellCount = Math.max(pipeCount - 1, 0);
  const separator = `| ${Array.from({ length: cellCount })
    .map(() => "---")
    .join(" | ")} |`;
  return [firstRow, separator, ...rows.slice(1)].join("\n");
};

export const tableCodec: MarkdownCodec = {
  type: "table",
  childSeparator: "\n",
  importNode: node =>
    node.type === "table" ? ({ type: "table", children: [] } as unknown as Descendant) : null,
  serializer: {
    isBlock: true,
    toMarkdown: (_element, children) => buildSimpleTable(children.split("\n").filter(isNonBlank)),
    toMarkdownStructured: (_element, children) => {
      const rows = children.split("\n").filter(isNonBlank);
      if (rows.length === 0) {
        return { output: "" };
      }
      return {
        output: buildSimpleTable(rows),
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
