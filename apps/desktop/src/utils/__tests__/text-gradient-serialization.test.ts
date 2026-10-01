import { describe, expect, it } from "vitest";

import type { FormattedText } from "@tau/editor";
import { htmlSerializerRegistry } from "../htmlSerializerRegistry";

// Markdown 部分的用例已迁到 packages/markdown/src/__tests__/text-gradient-serialization.test.ts
describe("text gradient html serialization", () => {
  it("HTML 序列化应输出渐变样式", () => {
    const html = htmlSerializerRegistry.serializeLeaf(
      {
        type: "formatted",
        text: "HTML",
        textGradient: "violet",
      } as FormattedText,
      { theme: "dark" }
    );

    expect(html).toContain("background-image:");
    expect(html).toContain("-webkit-text-fill-color: transparent");
  });
});
