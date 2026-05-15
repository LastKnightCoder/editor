import React from "react";
import type { ReactNode } from "react";
import { Box, Text } from "ink";
import { registry } from "../registry.js";
import type { TerminalRendererContext } from "../types.js";

registry.register({
  type: "paragraph",
  render: (
    _element: any,
    children: ReactNode,
    _context: TerminalRendererContext,
  ) => {
    return (
      <Box>
        <Text>{children}</Text>
      </Box>
    );
  },
});
