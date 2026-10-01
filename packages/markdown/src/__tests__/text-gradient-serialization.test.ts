import { describe, expect, it } from "vitest";

import type { Descendant } from "slate";
import type { FormattedText } from "../types.ts";
import { fixtureProcessor } from "./fixtures.ts";

const getMarkdown = fixtureProcessor.getMarkdown;
const leafToMarkdown = fixtureProcessor.leafToMarkdown;
const importFromMarkdown = fixtureProcessor.importFromMarkdown;

describe("text gradient markdown serialization", () => {
  it("leafToMarkdown 应优先输出渐变指令", () => {
    const leaf: FormattedText = {
      type: "formatted",
      text: "渐变文本",
      color: "#e33a32",
      darkColor: "#fa7873",
      textGradient: "ocean",
    };

    expect(leafToMarkdown(leaf)).toBe(":gradient[渐变文本]{preset=ocean}");
  });

  it("importFromMarkdown 应解析 gradient 指令", () => {
    const content = importFromMarkdown(":gradient[渐变文本]{preset=ocean}");
    const paragraph = content[0] as any;
    const leaf = paragraph.children?.[0] as FormattedText | undefined;

    expect(leaf?.text).toBe("渐变文本");
    expect(leaf?.textGradient).toBe("ocean");
  });

  it("gradient markdown 应支持 round-trip", () => {
    const value: Descendant[] = [
      {
        type: "paragraph",
        children: [
          {
            type: "formatted",
            text: "RoundTrip",
            textGradient: "sunset",
          },
        ],
      } as any,
    ];

    const markdown = getMarkdown(value).trim();
    expect(markdown).toBe(":gradient[RoundTrip]{preset=sunset}");

    const parsed = importFromMarkdown(markdown);
    const firstLeaf = (parsed[0] as any).children?.[0] as FormattedText | undefined;
    expect(firstLeaf?.textGradient).toBe("sunset");
  });
});
