import { describe, expect, it } from "vitest";
import { buildMermaidTheme, parseColor, withSvgBackground } from "../renderers/mermaid-theme";

const tokens: Record<string, string> = {
  "bg-surface": "#ffffff",
  "bg-surface-hover": "#f6f3ef",
  "bg-sunken": "#e7dbc8",
  "ink-1": "#43392c",
  "ink-2": "#6a5c49",
  "ink-3": "#a89a85",
  "ink-inverse": "#fff8ef",
  "line-1": "#e9e1d2",
  accent: "hsl(22 58% 42%)",
  "accent-soft": "rgba(0, 0, 0, 0.5)",
  font: '-apple-system,\n    "PingFang SC", sans-serif',
};
const token = (word: string) => tokens[word] ?? "";

describe("parseColor", () => {
  it("兼容 hex / rgb(a) / hsl(a) 的逗号与空格写法", () => {
    expect(parseColor("#fff")).toEqual({ r: 255, g: 255, b: 255, a: 1 });
    expect(parseColor("#00000080")?.a).toBeCloseTo(0.5, 2);
    expect(parseColor("rgba(67, 57, 44, 0.05)")).toEqual({ r: 67, g: 57, b: 44, a: 0.05 });
    expect(parseColor("rgb(67 57 44 / 50%)")).toEqual({ r: 67, g: 57, b: 44, a: 0.5 });
    expect(parseColor("hsla(0, 100%, 50%, 0.12)")).toEqual({ r: 255, g: 0, b: 0, a: 0.12 });
    expect(parseColor("hsl(120deg 100% 25%)")).toMatchObject({ g: 127.5, a: 1 });
  });

  it("无法解析时返回 null", () => {
    expect(parseColor("")).toBeNull();
    expect(parseColor("var(--tau-accent)")).toBeNull();
    expect(parseColor("#12345")).toBeNull();
  });
});

describe("buildMermaidTheme", () => {
  it("取值统一为不透明 hex，半透明色合成到卡片底色", () => {
    const vars = buildMermaidTheme(token, false)?.themeVariables ?? {};
    expect(vars.background).toBe("#ffffff");
    expect(vars.primaryColor).toBe("#808080");
    expect(vars.primaryBorderColor).toBe("#a95b2d");
    expect(vars.darkMode).toBe(false);
    for (const [key, value] of Object.entries(vars)) {
      if (typeof value === "string" && key !== "fontSize" && key !== "pieOpacity") {
        expect(value, key).toMatch(/^#[0-9a-f]{6}$/);
      }
    }
  });

  it("字体栈压成单行", () => {
    expect(buildMermaidTheme(token, false)?.fontFamily).toBe(
      '-apple-system, "PingFang SC", sans-serif'
    );
  });

  it("读不到卡片底色或正文色时返回 null", () => {
    expect(buildMermaidTheme(() => "", false)).toBeNull();
    expect(buildMermaidTheme(word => (word === "bg-surface" ? "#fff" : ""), true)).toBeNull();
  });
});

describe("withSvgBackground", () => {
  it("写进根节点已有的 style", () => {
    expect(
      withSvgBackground('<svg id="m" style="max-width: 10px;"><g style="x"/></svg>', "#fff")
    ).toBe('<svg id="m" style="background-color: #fff; max-width: 10px;"><g style="x"/></svg>');
  });

  it("根节点没有 style 时补上", () => {
    expect(withSvgBackground('<svg id="m"></svg>', "#000")).toBe(
      '<svg style="background-color: #000;" id="m"></svg>'
    );
  });
});
