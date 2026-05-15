import type { ReactNode } from "react";

export interface TerminalRendererContext {
  renderNodes: (nodes: any[], parent?: any) => ReactNode;
  renderNode: (node: any, index: number, parent?: any) => ReactNode;
  terminalWidth: number;
  listDepth: number;
}

export interface TerminalRenderer {
  type: string;
  render: (
    element: any,
    children: ReactNode,
    context: TerminalRendererContext,
    parent?: any,
  ) => ReactNode;
}
