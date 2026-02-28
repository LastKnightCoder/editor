import { describe, expect, it } from "vitest";

import type { Descendant } from "slate";
import { getMarkdown, importFromMarkdown } from "../markdown";

describe("mermaid style markdown serialization", () => {
  it("importFromMarkdown 能解析 mermaid ascii-unicode style", () => {
    const content = importFromMarkdown(
      "```mermaid style=ascii-unicode\ngraph TD\nA-->B\n```",
    );
    const element = content[0] as any;

    expect(element?.type).toBe("mermaid");
    expect(element?.renderStyle).toBe("ascii-unicode");
  });

  it("importFromMarkdown 能解析 mermaid svg style", () => {
    const content = importFromMarkdown(
      "```mermaid style=svg\ngraph TD\nA-->B\n```",
    );
    const element = content[0] as any;

    expect(element?.type).toBe("mermaid");
    expect(element?.renderStyle).toBe("svg");
  });

  it("importFromMarkdown 遇到非法 mermaid style 时忽略", () => {
    const content = importFromMarkdown(
      "```mermaid style=invalid\ngraph TD\nA-->B\n```",
    );
    const element = content[0] as any;

    expect(element?.type).toBe("mermaid");
    expect(element?.renderStyle).toBeUndefined();
  });

  it("getMarkdown 在 renderStyle 未设置时不输出 style meta", () => {
    const value: Descendant[] = [
      {
        type: "mermaid",
        chart: "graph TD\nA-->B",
        children: [{ type: "formatted", text: "" }],
      } as any,
    ];

    const markdown = getMarkdown(value).trim();
    expect(markdown).toBe("```mermaid\ngraph TD\nA-->B\n```");
    expect(markdown).not.toContain("style=");
  });

  it("getMarkdown 在 renderStyle 已设置时输出对应 style meta", () => {
    const value: Descendant[] = [
      {
        type: "mermaid",
        chart: "graph TD\nA-->B",
        renderStyle: "ascii-unicode",
        children: [{ type: "formatted", text: "" }],
      } as any,
    ];

    const markdown = getMarkdown(value).trim();
    expect(markdown).toBe(
      "```mermaid style=ascii-unicode\ngraph TD\nA-->B\n```",
    );
  });

  it("mermaid 节点 round-trip 后 renderStyle 保持一致", () => {
    const inputMarkdown =
      "```mermaid style=ascii-unicode\ngraph TD\nA-->B\n```";
    const parsed = importFromMarkdown(inputMarkdown);
    const serialized = getMarkdown(parsed).trim();
    const reparsed = importFromMarkdown(serialized);
    const element = reparsed[0] as any;

    expect(serialized).toBe(inputMarkdown);
    expect(element?.type).toBe("mermaid");
    expect(element?.renderStyle).toBe("ascii-unicode");
  });
});
