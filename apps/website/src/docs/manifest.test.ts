import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { userDocs } from "./manifest.ts";

const { all: ALL_DOC_ENTRIES, entries: DOC_ENTRIES, find: findDoc } = userDocs;
import { DEMO_NAMES } from "./showcase/registry.ts";
import { splitDocSegments } from "./segments.ts";

const contentDir = fileURLToPath(new URL("../../content/docs/", import.meta.url));

describe("文档目录", () => {
  it("目录与 content/docs 下的 Markdown 一一对应", () => {
    const files = readdirSync(contentDir)
      .filter(name => name.endsWith(".md"))
      .sort();
    const expected = ALL_DOC_ENTRIES.map(entry => `${entry.slug || "index"}.md`).sort();
    expect(files).toEqual(expected);
  });

  it("slug 不重复", () => {
    const slugs = ALL_DOC_ENTRIES.map(entry => entry.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("不进目录的文档仍可经地址打开", () => {
    expect(DOC_ENTRIES.some(entry => entry.slug === "browser-companion-privacy")).toBe(false);
    expect(findDoc("/docs/browser-companion-privacy/")?.hidden).toBe(true);
  });

  it("正文引用的示意都存在，站内链接都指向已有文档", () => {
    const slugs = new Set(ALL_DOC_ENTRIES.map(entry => entry.slug));
    for (const name of readdirSync(contentDir).filter(file => file.endsWith(".md"))) {
      const markdown = readFileSync(contentDir + name, "utf8");
      for (const segment of splitDocSegments(markdown))
        if (segment.kind === "demo")
          expect(DEMO_NAMES, `${name} 引用了 ${segment.name}`).toContain(segment.name);
      for (const [, slug] of markdown.matchAll(/\]\(\/docs\/([^/)#]*)\/?[^)]*\)/g))
        expect(slugs.has(slug), `${name} 链接到不存在的 /docs/${slug}/`).toBe(true);
    }
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
