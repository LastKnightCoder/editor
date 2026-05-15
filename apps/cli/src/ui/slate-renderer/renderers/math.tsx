import React from "react";
import type { ReactNode } from "react";
import { Box, Text } from "ink";
import { registry } from "../registry.js";
import type { TerminalRendererContext } from "../types.js";

registry.register({
  type: "inline-math",
  render: (element: any, _children: ReactNode) => {
    return <Text color="magenta">${element.tex || ""}$</Text>;
  },
});

registry.register({
  type: "block-math",
  render: (
    element: any,
    _children: ReactNode,
    _context: TerminalRendererContext,
  ) => {
    return (
      <Box flexDirection="column" marginTop={1} marginBottom={1}>
        <Text color="magenta">$$</Text>
        <Text color="magenta">{element.tex || ""}</Text>
        <Text color="magenta">$$</Text>
      </Box>
    );
  },
});
