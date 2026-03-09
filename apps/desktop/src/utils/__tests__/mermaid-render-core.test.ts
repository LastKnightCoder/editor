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

  it("能够识别甘特图 header", () => {
    const type = detectMermaidDiagramType(
      "%% 注释\n\ngantt\n  title 项目计划\n  section 第一阶段\n  任务: a1, 2026-03-01, 3d",
    );
    expect(type).toBe("gantt");
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

  it("关闭 beautiful-mermaid 后直接使用原生 mermaid 渲染", async () => {
    const code = "graph TD\nA-->B";
    const result = await renderMermaidWithFallback({
      code,
      mermaidId: "m-native",
      isDark: false,
      preference: {
        style: "ascii-unicode",
        lightTheme: "github-light",
        darkTheme: "github-dark",
        useBeautifulMermaid: false,
      },
    });

    expect(mockMermaidInitialize).toHaveBeenCalledTimes(1);
    expect(mockMermaidParse).toHaveBeenCalledWith(code);
    expect(result.engine).toBe("mermaid");
    expect(result.displayMode).toBe("svg");
    expect(result.displayContent).toBe("<svg>fallback</svg>");
    expect(result.isFallback).toBe(false);
  });

  it("甘特图会自动回退到原生 mermaid 渲染", async () => {
    const result = await renderMermaidWithFallback({
      code: [
        "gantt",
        "  title 项目计划",
        "  dateFormat YYYY-MM-DD",
        "  section 第一阶段",
        "  任务: a1, 2026-03-01, 3d",
      ].join("\n"),
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
      [
        "gantt",
        "  title 项目计划",
        "  dateFormat YYYY-MM-DD",
        "  section 第一阶段",
        "  任务: a1, 2026-03-01, 3d",
      ].join("\n"),
    );
    expect(result.engine).toBe("mermaid");
    expect(result.displayMode).toBe("svg");
    expect(result.displayContent).toBe("<svg>fallback</svg>");
    expect(result.isFallback).toBe(true);
  });

  it("状态图默认回退到原生 mermaid 渲染", async () => {
    const code = [
      "stateDiagram-v2",
      "  [*] --> Idle",
      "  Idle --> Active: start",
      "  Active --> [*]",
    ].join("\n");

    const result = await renderMermaidWithFallback({
      code,
      mermaidId: "m4",
      isDark: false,
      preference: {
        style: "svg",
        lightTheme: "github-light",
        darkTheme: "github-dark",
      },
    });

    expect(mockMermaidInitialize).toHaveBeenCalledTimes(1);
    expect(mockMermaidParse).toHaveBeenCalledWith(code);
    expect(result.engine).toBe("mermaid");
    expect(result.displayMode).toBe("svg");
    expect(result.displayContent).toBe("<svg>fallback</svg>");
    expect(result.isFallback).toBe(true);
  });
});
