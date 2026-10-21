import React from "react";
import type { ReactNode } from "react";
import { Text, Box } from "ink";
import { registry } from "./registry.js";
import type { TerminalRendererContext } from "./types.js";
import { renderFormattedText } from "./renderers/text.js";
import { collectContentResources } from "@tau/db-schema/content-resources";

export function renderNode(
  node: any,
  index: number,
  context: TerminalRendererContext,
  parent?: any
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

  const summary = resourceSummary(node, context);
  if (summary) {
    return (
      <Box key={index} marginTop={1} marginBottom={1}>
        <Text dimColor>[{summary}]</Text>
      </Box>
    );
  }

  // Fallback: render children directly
  return <React.Fragment key={index}>{children}</React.Fragment>;
}

const KIND_LABELS = {
  image: ["image", "images"],
  video: ["video", "videos"],
  audio: ["audio", "audio"],
  file: ["file", "files"],
} as const;

/** 声明了资源的节点（如插件媒体块）显示资源数量，例如「3 images · 1 video」 */
export function resourceSummary(node: any, context: TerminalRendererContext): string {
  const resources = collectContentResources([{ ...node, children: [] }], context.resources);
  if (!resources.length) return "";
  const counts = new Map<keyof typeof KIND_LABELS, number>();
  for (const { kind } of resources) counts.set(kind, (counts.get(kind) ?? 0) + 1);
  return [...counts]
    .map(([kind, count]) => `${count} ${KIND_LABELS[kind][count === 1 ? 0 : 1]}`)
    .join(" · ");
}

function renderChildren(node: any, context: TerminalRendererContext): ReactNode {
  if (!node.children || node.children.length === 0) return null;
  return context.renderNodes(node.children, node);
}
