import React from "react";
import type { ReactNode } from "react";
import { Box, Text } from "ink";
import { registry } from "../registry.js";
import type { TerminalRendererContext } from "../types.js";
import { renderNode } from "../render-node.js";

const BULLETS = ["•", "◦", "▪"];

registry.register({
  type: "bulleted-list",
  render: (
    element: any,
    _children: ReactNode,
    context: TerminalRendererContext,
  ) => {
    const items = element.children || [];
    const nextContext = { ...context, listDepth: context.listDepth + 1 };
    return (
      <Box flexDirection="column">
        {items.map((item: any, i: number) =>
          renderNode(item, i, nextContext, element),
        )}
      </Box>
    );
  },
});

registry.register({
  type: "numbered-list",
  render: (
    element: any,
    _children: ReactNode,
    context: TerminalRendererContext,
  ) => {
    const items = element.children || [];
    const nextContext = { ...context, listDepth: context.listDepth + 1 };
    return (
      <Box flexDirection="column">
        {items.map((item: any, i: number) =>
          renderNode(item, i, nextContext, element),
        )}
      </Box>
    );
  },
});

registry.register({
  type: "list-item",
  render: (
    element: any,
    _children: ReactNode,
    context: TerminalRendererContext,
    parent?: any,
  ) => {
    const depth = Math.max(0, context.listDepth - 1);
    const indent = "  ".repeat(depth);
    const isNumbered = parent?.type === "numbered-list";

    const itemChildren = element.children || [];
    const blocks = itemChildren.map((child: any, i: number) =>
      renderNode(child, i, context, element),
    );

    const marker = isNumbered ? (
      (() => {
        const siblings = parent?.children || [];
        const idx = siblings.indexOf(element);
        const num = (idx >= 0 ? idx : 0) + 1;
        return <Text dimColor>{num}.</Text>;
      })()
    ) : (
      <Text color="cyan">{BULLETS[depth % BULLETS.length]}</Text>
    );

    return (
      <Box>
        <Text>{indent}</Text>
        {marker}
        <Text> </Text>
        <Box flexDirection="column">{blocks}</Box>
      </Box>
    );
  },
});

registry.register({
  type: "check-list",
  render: (
    element: any,
    _children: ReactNode,
    context: TerminalRendererContext,
  ) => {
    const items = element.children || [];
    const nextContext = { ...context, listDepth: context.listDepth + 1 };
    return (
      <Box flexDirection="column">
        {items.map((item: any, i: number) =>
          renderNode(item, i, nextContext, element),
        )}
      </Box>
    );
  },
});

registry.register({
  type: "check-list-item",
  render: (
    element: any,
    _children: ReactNode,
    context: TerminalRendererContext,
  ) => {
    const depth = Math.max(0, context.listDepth - 1);
    const indent = "  ".repeat(depth);
    const checked = element.checked;

    const itemChildren = element.children || [];
    const blocks = itemChildren.map((child: any, i: number) =>
      renderNode(child, i, context, element),
    );

    const marker = checked ? (
      <Text color="green">[✓]</Text>
    ) : (
      <Text dimColor>[ ]</Text>
    );

    return (
      <Box>
        <Text>{indent}</Text>
        {marker}
        <Text> </Text>
        <Box flexDirection="column">{blocks}</Box>
      </Box>
    );
  },
});
