import React from "react";
import type { ReactNode } from "react";
import { Box, Text } from "ink";
import { registry } from "../registry.js";
import type { TerminalRendererContext } from "../types.js";
import { renderNode } from "../render-node.js";

// Emoji
registry.register({
  type: "emoji",
  render: (element: any) => {
    return <Text>{element.nativeEmoji || element.emoji || ""}</Text>;
  },
});

// Keyboard key
registry.register({
  type: "kbd",
  render: (_element: any, children: ReactNode) => {
    return <Text inverse> {children} </Text>;
  },
});

// Video
registry.register({
  type: "video",
  render: (element: any) => {
    return (
      <Box marginTop={1} marginBottom={1}>
        <Text dimColor>[Video: {element.src || "unknown"}]</Text>
      </Box>
    );
  },
});

// Audio
registry.register({
  type: "audio",
  render: (element: any) => {
    return (
      <Box marginTop={1} marginBottom={1}>
        <Text dimColor>[Audio: {element.src || "unknown"}]</Text>
      </Box>
    );
  },
});

// File attachment
registry.register({
  type: "file-attachment",
  render: (element: any) => {
    return (
      <Box marginTop={1} marginBottom={1}>
        <Text dimColor>
          [File: {element.fileName || element.src || "unknown"}]
        </Text>
      </Box>
    );
  },
});

// Webview
registry.register({
  type: "webview",
  render: (element: any) => {
    return (
      <Box marginTop={1} marginBottom={1}>
        <Text dimColor>[Embed: {element.url || "unknown"}]</Text>
      </Box>
    );
  },
});

// Front matter
registry.register({
  type: "front-matter",
  render: (element: any) => {
    return (
      <Box flexDirection="column" marginBottom={1}>
        <Text dimColor>---</Text>
        <Text dimColor>{element.value || ""}</Text>
        <Text dimColor>---</Text>
      </Box>
    );
  },
});

// Styled text (colored inline text)
registry.register({
  type: "styled-text",
  render: (element: any, children: ReactNode) => {
    const colorMap: Record<string, string> = {
      red: "red",
      blue: "blue",
      green: "green",
      yellow: "yellow",
      purple: "magenta",
      orange: "#f97316",
      pink: "#ec4899",
      gray: "gray",
    };
    const color = colorMap[element.color] || element.color || undefined;
    return <Text color={color}>{children}</Text>;
  },
});

// Underline
registry.register({
  type: "underline",
  render: (_element: any, children: ReactNode) => {
    return <Text underline>{children}</Text>;
  },
});

// Annotation (footnote)
registry.register({
  type: "annotation",
  render: (element: any, children: ReactNode) => {
    return (
      <Text>
        {children}
        <Text color="cyan" dimColor>
          [*]
        </Text>
      </Text>
    );
  },
});

// Chart
registry.register({
  type: "chart",
  render: (element: any) => {
    const chartType = element.config?.type || "chart";
    return (
      <Box marginTop={1} marginBottom={1}>
        <Text dimColor>[Chart: {chartType}]</Text>
      </Box>
    );
  },
});

// HTML block
registry.register({
  type: "html-block",
  render: (element: any) => {
    return (
      <Box marginTop={1} marginBottom={1}>
        <Text dimColor>{element.html || ""}</Text>
      </Box>
    );
  },
});

// HTML inline
registry.register({
  type: "html-inline",
  render: (element: any) => {
    return <Text dimColor>{element.html || ""}</Text>;
  },
});

// Custom block
registry.register({
  type: "custom-block",
  render: (element: any) => {
    return (
      <Box marginTop={1} marginBottom={1}>
        <Text dimColor>{element.content || ""}</Text>
      </Box>
    );
  },
});

// Mermaid diagram
registry.register({
  type: "mermaid",
  render: (
    element: any,
    _children: ReactNode,
    context: TerminalRendererContext,
  ) => {
    return (
      <Box
        flexDirection="column"
        marginTop={1}
        marginBottom={1}
        borderStyle="round"
        borderColor="gray"
        paddingX={1}
      >
        <Text dimColor bold>
          mermaid
        </Text>
        <Text>{element.chart || ""}</Text>
      </Box>
    );
  },
});

// PlantUML
registry.register({
  type: "plantuml",
  render: (element: any) => {
    return (
      <Box
        flexDirection="column"
        marginTop={1}
        marginBottom={1}
        borderStyle="round"
        borderColor="gray"
        paddingX={1}
      >
        <Text dimColor bold>
          plantuml
        </Text>
        <Text>{element.content || ""}</Text>
      </Box>
    );
  },
});

// TikZ
registry.register({
  type: "tikz",
  render: (element: any) => {
    return (
      <Box
        flexDirection="column"
        marginTop={1}
        marginBottom={1}
        borderStyle="round"
        borderColor="gray"
        paddingX={1}
      >
        <Text dimColor bold>
          tikz
        </Text>
        <Text>{element.content || ""}</Text>
      </Box>
    );
  },
});

// Typst
registry.register({
  type: "typst",
  render: (element: any) => {
    return (
      <Box
        flexDirection="column"
        marginTop={1}
        marginBottom={1}
        borderStyle="round"
        borderColor="gray"
        paddingX={1}
      >
        <Text dimColor bold>
          typst
        </Text>
        <Text>{element.content || ""}</Text>
      </Box>
    );
  },
});

// ABC notation
registry.register({
  type: "abc",
  render: (element: any) => {
    return (
      <Box
        flexDirection="column"
        marginTop={1}
        marginBottom={1}
        borderStyle="round"
        borderColor="gray"
        paddingX={1}
      >
        <Text dimColor bold>
          abc
        </Text>
        <Text>{element.content || ""}</Text>
      </Box>
    );
  },
});

// Graphviz
registry.register({
  type: "graphviz",
  render: (element: any) => {
    return (
      <Box
        flexDirection="column"
        marginTop={1}
        marginBottom={1}
        borderStyle="round"
        borderColor="gray"
        paddingX={1}
      >
        <Text dimColor bold>
          graphviz
        </Text>
        <Text>{element.dot || ""}</Text>
      </Box>
    );
  },
});

// Tabs
registry.register({
  type: "tabs",
  render: (
    element: any,
    _children: ReactNode,
    context: TerminalRendererContext,
  ) => {
    const tabsContent = element.tabsContent || [];
    const blocks = (element.children || []).map((child: any, i: number) =>
      renderNode(child, i, context, element),
    );
    const tabLabels = tabsContent.map((t: any) => t.title || "Tab").join(" | ");

    return (
      <Box flexDirection="column" marginTop={1} marginBottom={1}>
        <Text dimColor>[{tabLabels}]</Text>
        <Box flexDirection="column">{blocks}</Box>
      </Box>
    );
  },
});

// Multi-column container
registry.register({
  type: "multi-column-container",
  render: (
    element: any,
    _children: ReactNode,
    context: TerminalRendererContext,
  ) => {
    const items = (element.children || []).map((child: any, i: number) =>
      renderNode(child, i, context, element),
    );
    return (
      <Box flexDirection="column" marginTop={1} marginBottom={1}>
        {items}
      </Box>
    );
  },
});

// Multi-column item
registry.register({
  type: "multi-column-item",
  render: (
    element: any,
    _children: ReactNode,
    context: TerminalRendererContext,
  ) => {
    const blocks = (element.children || []).map((child: any, i: number) =>
      renderNode(child, i, context, element),
    );
    return <Box flexDirection="column">{blocks}</Box>;
  },
});

// Comment
registry.register({
  type: "comment",
  render: (_element: any, children: ReactNode) => {
    return <Text>{children}</Text>;
  },
});

// Content link
registry.register({
  type: "content-link",
  render: (element: any, children: ReactNode) => {
    const title = element.contentTitle || element.title || "";
    return (
      <Text>
        <Text underline color="#61afef">
          {children || title}
        </Text>
      </Text>
    );
  },
});
