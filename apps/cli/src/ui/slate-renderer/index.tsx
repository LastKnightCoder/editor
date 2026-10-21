import React from "react";
import type { ReactNode } from "react";
import { Box } from "ink";
import { renderNode } from "./render-node.js";
import type { TerminalRendererContext } from "./types.js";
import "./renderers/register-all.js";
import type { ContentResourceDeclarations } from "@tau/db-schema/content-resources";
import { loadContentResources } from "../../data-access/content-resources.js";

export interface SlateRendererProps {
  nodes: any[];
  width?: number;
  /** 节点资源声明，缺省读当前库（内置与库里保存的插件声明） */
  resources?: ContentResourceDeclarations;
}

export function SlateRenderer({ nodes, width, resources }: SlateRendererProps) {
  const terminalWidth = width ?? process.stdout.columns ?? 80;

  const context: TerminalRendererContext = {
    terminalWidth,
    listDepth: 0,
    resources: resources ?? loadContentResources(),
    renderNodes(childNodes: any[], parent?: any): ReactNode {
      return childNodes.map((node, i) => renderNode(node, i, context, parent));
    },
    renderNode(node: any, index: number, parent?: any): ReactNode {
      return renderNode(node, index, context, parent);
    },
  };

  return <Box flexDirection="column">{nodes.map((node, i) => renderNode(node, i, context))}</Box>;
}
