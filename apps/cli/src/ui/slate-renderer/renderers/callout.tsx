import React from "react";
import type { ReactNode } from "react";
import { Box, Text } from "ink";
import { registry } from "../registry.js";
import type { TerminalRendererContext } from "../types.js";
import { renderNode } from "../render-node.js";

const CALLOUT_ICONS: Record<string, string> = {
  tip: "💡",
  info: "ℹ️ ",
  warning: "⚠️ ",
  danger: "🚨",
  note: "📝",
};

const CALLOUT_COLORS: Record<string, string> = {
  tip: "green",
  info: "blue",
  warning: "yellow",
  danger: "red",
  note: "gray",
};

registry.register({
  type: "callout",
  render: (
    element: any,
    _children: ReactNode,
    context: TerminalRendererContext,
  ) => {
    const calloutType = element.calloutType || "info";
    const title = element.title || calloutType;
    const icon = CALLOUT_ICONS[calloutType] || "ℹ️ ";
    const color = CALLOUT_COLORS[calloutType] || "blue";
    const blocks = (element.children || []).map((child: any, i: number) =>
      renderNode(child, i, context, element),
    );

    return (
      <Box flexDirection="column" marginTop={1} marginBottom={1}>
        <Box>
          <Text color={color}>▌ {icon} </Text>
          <Text bold color={color}>
            {title}
          </Text>
        </Box>
        <Box marginLeft={2} flexDirection="column">
          {blocks}
        </Box>
      </Box>
    );
  },
});
