import React from "react";
import type { ReactNode } from "react";
import { Text } from "ink";
import { registry } from "../registry.js";
import type { TerminalRendererContext } from "../types.js";

registry.register({
  type: "link",
  render: (
    element: any,
    children: ReactNode,
    _context: TerminalRendererContext,
  ) => {
    return (
      <Text>
        <Text underline color="#61afef">
          {children}
        </Text>
        <Text dimColor> ({element.url})</Text>
      </Text>
    );
  },
});
