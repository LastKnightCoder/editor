import { describe, expect, it, vi } from "vitest";

const mockMermaidInitialize = vi.fn();
const mockMermaidParse = vi.fn();
const mockMermaidRender = vi.fn();

vi.mock("mermaid", () => ({
  default: {
    initialize: mockMermaidInitialize,
    parse: mockMermaidParse,
    render: mockMermaidRender,
  },
}));

import { renderMermaidSvg } from "../renderers/mermaid-render-core";

describe("mermaid-render-core", () => {
  it("读不到主题 token 时回落官方主题：浅色 default", async () => {
    mockMermaidParse.mockResolvedValue(undefined);
    mockMermaidRender.mockResolvedValue({ svg: "<svg>diagram</svg>" });

    const svg = await renderMermaidSvg({
      code: "graph TD\nA-->B",
      mermaidId: "m1",
      isDark: false,
    });

    expect(mockMermaidInitialize).toHaveBeenCalledWith(
      expect.objectContaining({ theme: "default", startOnLoad: false })
    );
    expect(mockMermaidParse).toHaveBeenCalledWith("graph TD\nA-->B");
    expect(mockMermaidRender).toHaveBeenCalledWith("m1", "graph TD\nA-->B");
    expect(svg).toBe("<svg>diagram</svg>");
  });

  it("读不到主题 token 时回落官方主题：暗色 dark", async () => {
    mockMermaidParse.mockResolvedValue(undefined);
    mockMermaidRender.mockResolvedValue({ svg: "<svg>dark</svg>" });

    await renderMermaidSvg({
      code: "sequenceDiagram\nAlice->>Bob: Hi",
      mermaidId: "m2",
      isDark: true,
    });

    expect(mockMermaidInitialize).toHaveBeenCalledWith(expect.objectContaining({ theme: "dark" }));
  });

  it("有主题 token 时用 base 主题取色，并给 SVG 根节点补卡片底色", async () => {
    mockMermaidParse.mockResolvedValue(undefined);
    mockMermaidRender.mockResolvedValue({ svg: '<svg id="m3" style="max-width: 10px;"></svg>' });
    const tokens: Record<string, string> = {
      "bg-surface": "#2e2820",
      "ink-1": "#ece2d0",
      accent: "#d9a066",
      font: "sans-serif",
    };

    const svg = await renderMermaidSvg({
      code: "graph TD\nA-->B",
      mermaidId: "m3",
      isDark: true,
      token: word => tokens[word] ?? "",
    });

    expect(mockMermaidInitialize).toHaveBeenLastCalledWith(
      expect.objectContaining({
        theme: "base",
        fontFamily: "sans-serif",
        themeVariables: expect.objectContaining({
          darkMode: true,
          background: "#2e2820",
          primaryBorderColor: "#d9a066",
          primaryTextColor: "#ece2d0",
        }),
      })
    );
    expect(svg).toBe('<svg id="m3" style="background-color: #2e2820; max-width: 10px;"></svg>');
  });
});
