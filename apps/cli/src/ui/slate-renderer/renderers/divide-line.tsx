import React from "react";
import type { ReactNode } from "react";
import { Box, Text } from "ink";
import { registry } from "../registry.js";
import type { TerminalRendererContext } from "../types.js";

registry.register({
  type: "divide-line",
  render: (
    _element: any,
    _children: ReactNode,
    context: TerminalRendererContext,
  ) => {
    const width = Math.min(60, context.terminalWidth - 2);
    return (
      <Box marginTop={1} marginBottom={1}>
        <Text dimColor>{"─".repeat(width)}</Text>
      </Box>
    );
  },
});
