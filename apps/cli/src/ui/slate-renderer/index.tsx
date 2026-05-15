import React from "react";
import type { ReactNode } from "react";
import { Box } from "ink";
import { renderNode } from "./render-node.js";
import type { TerminalRendererContext } from "./types.js";
import "./renderers/register-all.js";

export interface SlateRendererProps {
  nodes: any[];
  width?: number;
}

export function SlateRenderer({ nodes, width }: SlateRendererProps) {
  const terminalWidth = width ?? process.stdout.columns ?? 80;

  const context: TerminalRendererContext = {
    terminalWidth,
    listDepth: 0,
    renderNodes(childNodes: any[], parent?: any): ReactNode {
      return childNodes.map((node, i) => renderNode(node, i, context, parent));
    },
    renderNode(node: any, index: number, parent?: any): ReactNode {
      return renderNode(node, index, context, parent);
    },
  };

  return (
    <Box flexDirection="column">
      {nodes.map((node, i) => renderNode(node, i, context))}
    </Box>
  );
}
