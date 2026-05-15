import React from "react";
import type { ReactNode } from "react";
import { Text, Box } from "ink";
import { registry } from "./registry.js";
import type { TerminalRendererContext } from "./types.js";
import { renderFormattedText } from "./renderers/text.js";

export function renderNode(
  node: any,
  index: number,
  context: TerminalRendererContext,
  parent?: any,
): ReactNode {
  if (node.type === "formatted") {
    return renderFormattedText(node, index);
  }

  const renderer = registry.getRenderer(node.type);
  const children = renderChildren(node, context);

  if (renderer) {
    return (
      <React.Fragment key={index}>
        {renderer.render(node, children, context, parent)}
      </React.Fragment>
    );
  }

  // Fallback: render children directly
  return <React.Fragment key={index}>{children}</React.Fragment>;
}

function renderChildren(
  node: any,
  context: TerminalRendererContext,
): ReactNode {
  if (!node.children || node.children.length === 0) return null;
  return context.renderNodes(node.children, node);
}
