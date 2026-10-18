import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { DOC_ENTRIES, findDoc } from "./manifest.ts";

const contentDir = fileURLToPath(new URL("../../content/docs/", import.meta.url));

describe("文档目录", () => {
  it("目录与 content/docs 下的 Markdown 一一对应", () => {
    const files = readdirSync(contentDir)
      .filter(name => name.endsWith(".md"))
      .sort();
    const expected = DOC_ENTRIES.map(entry => `${entry.slug || "index"}.md`).sort();
    expect(files).toEqual(expected);
  });

  it("slug 不重复", () => {
    const slugs = DOC_ENTRIES.map(entry => entry.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("按地址找文档，末尾斜杠可有可无", () => {
    expect(findDoc("/docs/")?.slug).toBe("");
    expect(findDoc("/docs")?.slug).toBe("");
    expect(findDoc("/docs/install")?.slug).toBe("install");
    expect(findDoc("/docs/install/")?.slug).toBe("install");
    expect(findDoc("/docs/missing/")).toBeUndefined();
    expect(findDoc("/docs/install/extra")).toBeUndefined();
  });
});
