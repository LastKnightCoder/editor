import React from "react";
import type { ReactNode } from "react";
import { Box, Text } from "ink";
import { registry } from "../registry.js";
import type { TerminalRendererContext } from "../types.js";
import { renderNode } from "../render-node.js";

function extractPlainText(node: any): string {
  if (node.type === "formatted") return node.text || "";
  if (node.children) {
    return node.children.map((c: any) => extractPlainText(c)).join("");
  }
  return "";
}

function measureCellWidth(cell: any): number {
  const text = extractPlainText(cell);
  let width = 0;
  for (const ch of text) {
    width += ch.charCodeAt(0) > 0x7f ? 2 : 1;
  }
  return Math.max(width, 3);
}

registry.register({
  type: "table",
  render: (
    element: any,
    _children: ReactNode,
    context: TerminalRendererContext,
  ) => {
    const rows: any[] = element.children || [];
    if (rows.length === 0) return null;

    const numCols = rows[0]?.children?.length || 0;
    if (numCols === 0) return null;

    // Compute column widths
    const colWidths: number[] = new Array(numCols).fill(3);
    for (const row of rows) {
      const cells = row.children || [];
      for (let c = 0; c < cells.length && c < numCols; c++) {
        colWidths[c] = Math.max(colWidths[c], measureCellWidth(cells[c]));
      }
    }

    // Cap total width
    const maxTotal = context.terminalWidth - 4 - (numCols + 1);
    const total = colWidths.reduce((a, b) => a + b, 0);
    if (total > maxTotal) {
      const ratio = maxTotal / total;
      for (let i = 0; i < colWidths.length; i++) {
        colWidths[i] = Math.max(3, Math.floor(colWidths[i] * ratio));
      }
    }

    const topBorder =
      "┌" + colWidths.map((w) => "─".repeat(w + 2)).join("┬") + "┐";
    const midBorder =
      "├" + colWidths.map((w) => "─".repeat(w + 2)).join("┼") + "┤";
    const botBorder =
      "└" + colWidths.map((w) => "─".repeat(w + 2)).join("┴") + "┘";

    const renderedRows: ReactNode[] = [];
    renderedRows.push(
      <Text key="top" dimColor>
        {topBorder}
      </Text>,
    );

    rows.forEach((row: any, rowIdx: number) => {
      const cells = row.children || [];
      const cellTexts = cells.map((cell: any) => extractPlainText(cell));

      const rowStr = cellTexts
        .map((text: string, c: number) => {
          const w = colWidths[c] || 3;
          const padded = text.slice(0, w).padEnd(w);
          return ` ${padded} `;
        })
        .join("│");

      if (rowIdx === 0) {
        renderedRows.push(
          <Text key={`row-${rowIdx}`}>
            <Text dimColor>│</Text>
            <Text bold>{rowStr}</Text>
            <Text dimColor>│</Text>
          </Text>,
        );
        renderedRows.push(
          <Text key="mid" dimColor>
            {midBorder}
          </Text>,
        );
      } else {
        renderedRows.push(
          <Text key={`row-${rowIdx}`}>
            <Text dimColor>│</Text>
            <Text>{rowStr}</Text>
            <Text dimColor>│</Text>
          </Text>,
        );
      }
    });

    renderedRows.push(
      <Text key="bot" dimColor>
        {botBorder}
      </Text>,
    );

    return (
      <Box flexDirection="column" marginTop={1} marginBottom={1}>
        {renderedRows}
      </Box>
    );
  },
});

registry.register({
  type: "table-row",
  render: (_element: any, children: ReactNode) => children,
});

registry.register({
  type: "table-cell",
  render: (_element: any, children: ReactNode) => children,
});
