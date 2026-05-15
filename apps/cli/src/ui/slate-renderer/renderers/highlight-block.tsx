import React from "react";
import type { ReactNode } from "react";
import { Box, Text } from "ink";
import { registry } from "../registry.js";
import type { TerminalRendererContext } from "../types.js";
import { renderNode } from "../render-node.js";

const BLOCK_COLORS: Record<string, string> = {
  red: "red",
  green: "green",
  yellow: "yellow",
  blue: "blue",
  orange: "#f97316",
  purple: "magenta",
};

registry.register({
  type: "highlight-block",
  render: (
    element: any,
    _children: ReactNode,
    context: TerminalRendererContext,
  ) => {
    const color = BLOCK_COLORS[element.color] || "yellow";
    const blocks = (element.children || []).map((child: any, i: number) =>
      renderNode(child, i, context, element),
    );

    return (
      <Box marginLeft={1} flexDirection="column">
        <Box>
          <Text color={color}>▌ </Text>
          <Box flexDirection="column">{blocks}</Box>
        </Box>
      </Box>
    );
  },
});
