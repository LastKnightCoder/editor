import React from "react";
import type { ReactNode } from "react";
import { Box, Text } from "ink";
import { registry } from "../registry.js";
import type { TerminalRendererContext } from "../types.js";
import { renderNode } from "../render-node.js";

registry.register({
  type: "blockquote",
  render: (
    element: any,
    _children: ReactNode,
    context: TerminalRendererContext,
  ) => {
    const blocks = (element.children || []).map((child: any, i: number) =>
      renderNode(child, i, context, element),
    );
    return (
      <Box marginLeft={1}>
        <Text color="gray">│ </Text>
        <Box flexDirection="column">{blocks}</Box>
      </Box>
    );
  },
});
