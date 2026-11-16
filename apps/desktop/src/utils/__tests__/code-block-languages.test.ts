import { describe, expect, it } from "vitest";

import { normalizeCodeBlockLanguageDisplayName } from "@tau/shared";

describe("code block languages", () => {
  it("应将常见语言别名规范化为展示名", () => {
    expect(normalizeCodeBlockLanguageDisplayName("js")).toBe("JavaScript");
    expect(normalizeCodeBlockLanguageDisplayName("typescript")).toBe("TypeScript");
    expect(normalizeCodeBlockLanguageDisplayName("tsx")).toBe("TSX");
    expect(normalizeCodeBlockLanguageDisplayName("py")).toBe("Python");
    expect(normalizeCodeBlockLanguageDisplayName("csharp")).toBe("C#");
    expect(normalizeCodeBlockLanguageDisplayName("graphql")).toBe("GraphQL");
    expect(normalizeCodeBlockLanguageDisplayName("dockerfile")).toBe("Dockerfile");
    expect(normalizeCodeBlockLanguageDisplayName("plaintext")).toBe("Plain Text");
  });

  it("未命中字典时应保留原始值", () => {
    expect(normalizeCodeBlockLanguageDisplayName("CustomLang")).toBe("CustomLang");
  });
});
