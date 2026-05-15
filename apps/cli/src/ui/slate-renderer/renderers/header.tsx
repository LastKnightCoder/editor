import React from "react";
import type { ReactNode } from "react";
import { Box, Text } from "ink";
import { registry } from "../registry.js";
import type { TerminalRendererContext } from "../types.js";

registry.register({
  type: "header",
  render: (
    element: any,
    children: ReactNode,
    context: TerminalRendererContext,
  ) => {
    const level = element.level || 1;
    const prefix = "#".repeat(level) + " ";

    if (level === 1) {
      return (
        <Box flexDirection="column" marginTop={1} marginBottom={1}>
          <Text bold color="cyan">
            {prefix}
            {children}
          </Text>
          <Text dimColor>
            {"═".repeat(Math.min(60, context.terminalWidth - 2))}
          </Text>
        </Box>
      );
    }

    if (level === 2) {
      return (
        <Box marginTop={1}>
          <Text bold color="green">
            {prefix}
            {children}
          </Text>
        </Box>
      );
    }

    if (level === 3) {
      return (
        <Box marginTop={1}>
          <Text bold color="yellow">
            {prefix}
            {children}
          </Text>
        </Box>
      );
    }

    return (
      <Box marginTop={1}>
        <Text bold>
          {prefix}
          {children}
        </Text>
      </Box>
    );
  },
});
