import { beforeEach, describe, expect, it, vi } from "vitest";

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

import {
  detectMermaidDiagramType,
  renderMermaidWithFallback,
} from "../../../../../packages/shared/src/utils/mermaid-render-core.ts";

describe("mermaid-render-core", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMermaidParse.mockResolvedValue(undefined);
    mockMermaidRender.mockResolvedValue({ svg: "<svg>fallback</svg>" });
  });

  it("能够识别首个有效 header 的图类型", () => {
    const type = detectMermaidDiagramType("%% 注释\n\nflowchart TD\nA-->B");
    expect(type).toBe("flowchart");
  });

  it("支持类型在 SVG 模式下优先使用 beautiful-mermaid 并清理字体 import", async () => {
    const result = await renderMermaidWithFallback({
      code: "graph TD\nA-->B",
      mermaidId: "m1",
      isDark: false,
      preference: {
        style: "svg",
        lightTheme: "github-light",
        darkTheme: "github-dark",
      },
    });

    expect(result.engine).toBe("beautiful-mermaid");
    expect(result.isFallback).toBe(false);
    expect(result.displayMode).toBe("svg");
    expect(result.displayContent).toContain("<svg");
    expect(result.cachedSvg).toContain("<svg");
    expect(result.displayContent).not.toContain("@import");
    expect(result.displayContent).not.toContain("fonts.googleapis.com");
    expect(result.displayContent).not.toContain("background:var(--bg)");
  });

  it("ASCII 模式在支持类型下显示 ASCII，同时返回缓存 SVG", async () => {
    const result = await renderMermaidWithFallback({
      code: "sequenceDiagram\nAlice->>Bob: Hi",
      mermaidId: "m2",
      isDark: true,
      preference: {
        style: "ascii-unicode",
        lightTheme: "github-light",
        darkTheme: "github-dark",
      },
    });

    expect(result.displayMode).toBe("ascii");
    expect(result.displayContent.length).toBeGreaterThan(0);
    expect(result.cachedSvg).toContain("<svg");
    expect(result.engine).toBe("beautiful-mermaid");
    expect(result.isFallback).toBe(false);
  });

  it("不支持类型会自动回退到原生 mermaid 渲染", async () => {
    const result = await renderMermaidWithFallback({
      code: 'pie\ntitle Pets\n"Cat": 3\n"Dog": 2',
      mermaidId: "m3",
      isDark: false,
      preference: {
        style: "ascii-unicode",
        lightTheme: "github-light",
        darkTheme: "github-dark",
      },
    });

    expect(mockMermaidInitialize).toHaveBeenCalledTimes(1);
    expect(mockMermaidParse).toHaveBeenCalledWith(
      'pie\ntitle Pets\n"Cat": 3\n"Dog": 2',
    );
    expect(result.engine).toBe("mermaid");
    expect(result.displayMode).toBe("svg");
    expect(result.displayContent).toBe("<svg>fallback</svg>");
    expect(result.isFallback).toBe(true);
  });
});
