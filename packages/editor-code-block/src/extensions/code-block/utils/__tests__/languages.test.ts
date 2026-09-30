import { describe, expect, it } from "vitest";

import { CODE_BLOCK_LANGUAGE_OPTIONS, normalizeCodeBlockLanguageDisplayName } from "@tau/shared";

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

  it("应暴露包含更多语言的共享选项", () => {
    const values = CODE_BLOCK_LANGUAGE_OPTIONS.map(item => item.value);

    expect(values).toContain("JavaScript");
    expect(values).toContain("TypeScript");
    expect(values).toContain("TSX");
    expect(values).toContain("GraphQL");
    expect(values).toContain("PowerShell");
    expect(values).toContain("Protocol Buffer");
    expect(values).toContain("Dockerfile");
    expect(values).toContain("Plain Text");
  });
});
