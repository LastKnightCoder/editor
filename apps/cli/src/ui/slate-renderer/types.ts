import type { ReactNode } from "react";
import type { ContentResourceDeclarations } from "@tau/db-schema/content-resources";

export interface TerminalRendererContext {
  renderNodes: (nodes: any[], parent?: any) => ReactNode;
  renderNode: (node: any, index: number, parent?: any) => ReactNode;
  terminalWidth: number;
  listDepth: number;
  /** 节点资源声明：没有专门渲染器的节点按它显示资源摘要 */
  resources: ContentResourceDeclarations;
}

export interface TerminalRenderer {
  type: string;
  render: (
    element: any,
    children: ReactNode,
    context: TerminalRendererContext,
    parent?: any
  ) => ReactNode;
}
