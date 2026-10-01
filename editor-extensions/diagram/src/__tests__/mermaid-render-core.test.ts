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
  it("使用原生 mermaid 渲染 SVG，浅色使用 default 主题", async () => {
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

  it("暗色模式下使用 dark 主题", async () => {
    mockMermaidParse.mockResolvedValue(undefined);
    mockMermaidRender.mockResolvedValue({ svg: "<svg>dark</svg>" });

    await renderMermaidSvg({
      code: "sequenceDiagram\nAlice->>Bob: Hi",
      mermaidId: "m2",
      isDark: true,
    });

    expect(mockMermaidInitialize).toHaveBeenCalledWith(expect.objectContaining({ theme: "dark" }));
  });
});
