import React from "react";
import type { ReactNode } from "react";
import { Box, Text } from "ink";
import { registry } from "../registry.js";
import type { TerminalRendererContext } from "../types.js";

registry.register({
  type: "image",
  render: (element: any, _children: ReactNode) => {
    const label = element.alt || element.description || element.url || "image";
    return (
      <Box marginTop={1} marginBottom={1}>
        <Text dimColor>[Image: {label}]</Text>
      </Box>
    );
  },
});

registry.register({
  type: "inline-image",
  render: (element: any, _children: ReactNode) => {
    const label = element.alt || "image";
    return <Text dimColor>[{label}]</Text>;
  },
});
