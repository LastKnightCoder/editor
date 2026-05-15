import React from "react";
import type { ReactNode } from "react";
import { Box, Text } from "ink";
import { registry } from "../registry.js";
import type { TerminalRendererContext } from "../types.js";
import { renderNode } from "../render-node.js";

registry.register({
  type: "detail",
  render: (
    element: any,
    _children: ReactNode,
    context: TerminalRendererContext,
  ) => {
    const title = element.title || "Details";
    const blocks = (element.children || []).map((child: any, i: number) =>
      renderNode(child, i, context, element),
    );

    return (
      <Box flexDirection="column" marginTop={1} marginBottom={1}>
        <Text bold>
          <Text color="cyan">▶</Text> {title}
        </Text>
        <Box marginLeft={2} flexDirection="column">
          {blocks}
        </Box>
      </Box>
    );
  },
});
