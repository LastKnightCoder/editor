import React from "react";
import type { ReactNode } from "react";
import { Box, Text } from "ink";
import { registry } from "../registry.js";
import type { TerminalRendererContext } from "../types.js";
import { highlightCode } from "../highlight.js";

registry.register({
  type: "code-block",
  render: (
    element: any,
    _children: ReactNode,
    _context: TerminalRendererContext,
  ) => {
    const code = (element.code || "").replace(/\n$/, "");
    const language = element.language || "";
    const lines = highlightCode(code, language);

    return (
      <Box
        flexDirection="column"
        marginTop={1}
        marginBottom={1}
        borderStyle="round"
        borderColor="gray"
        paddingX={1}
      >
        {language && (
          <Text dimColor bold>
            {language}
          </Text>
        )}
        {lines.map((tokens, lineIdx) => (
          <Text key={lineIdx}>
            {tokens.map((token, tokenIdx) => (
              <Text key={tokenIdx} color={token.color}>
                {token.text}
              </Text>
            ))}
          </Text>
        ))}
      </Box>
    );
  },
});
