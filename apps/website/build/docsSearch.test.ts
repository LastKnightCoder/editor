import { describe, expect, it } from "vitest";
import { createDocCollection } from "../src/docs/collection.ts";
import { developerDocs } from "../src/docs/developers/manifest.ts";
import { userDocs } from "../src/docs/manifest.ts";
import { createDocSearch } from "../src/docs/search.ts";
import { buildDocSearchPayload, readDocSearchPayload } from "./docsSearch.ts";

const collection = createDocCollection({
  site: "docs",
  basePath: "/docs/",
  name: "使用文档",
  groups: [{ title: "开始", items: [
    { slug: "", title: "概览", summary: "使用指南" },
    { slug: "private", title: "隐私政策", summary: "只经链接打开", hidden: true },
  ] }],
});

describe("文档搜索索引", () => {
  it("按实际渲染标题切段，保留表格、链接文字、代码与示意说明", () => {
    const payload = buildDocSearchPayload(collection, () => `开场介绍

## 安装 **Tau**

[下载入口](https://example.com/never-index-this-url)

| 平台 | 说明 |
| --- | --- |
| macOS | Apple 芯片 |

~~~ts
context.pages.register({ id: "stats" });
// ## 代码中的标题
~~~

::demo{name="first-card" caption="建立知识卡片"}

## 安装 **Tau**

重新安装步骤
`);
    expect(payload.documents).toHaveLength(3);
    expect(payload.documents.map(doc => doc.href)).toEqual([
      "/docs/", "/docs/#安装-tau", "/docs/#安装-tau-1",
    ].map(href => href.split("#").map((part, index) => index ? encodeURIComponent(part) : part).join("#")));
    expect(payload.documents[1].section).toBe("安装 Tau");
    expect(payload.documents[1].content).toContain("下载入口");
    expect(payload.documents[1].content).toContain("Apple 芯片");
    expect(payload.documents[1].content).toContain("context.pages.register");
    expect(payload.documents[1].content).toContain("建立知识卡片");
    expect(payload.documents[1].content).not.toContain("never-index-this-url");
    expect(payload.documents.some(doc => doc.href.includes("private"))).toBe(false);
    expect(createDocSearch(JSON.parse(JSON.stringify(payload)))("context.pages.register")[0].item.section).toBe("安装 Tau");
  });

  it.each([
    ["docs", userDocs],
    ["developers", developerDocs],
  ] as const)("%s 从真实文档生成，覆盖全部可见文档且链接不跨文档集", (name, docs) => {
    const payload = readDocSearchPayload(name);
    expect(payload.basePath).toBe(docs.basePath);
    expect(payload.documents.filter(item => !item.section).map(item => item.href)).toEqual(
      docs.entries.map(entry => docs.href(entry.slug))
    );
    expect(payload.documents.length).toBeGreaterThan(docs.entries.length);
    expect(new Set(payload.documents.map(item => item.href)).size).toBe(payload.documents.length);
    for (const document of payload.documents) {
      expect(docs.find(document.href.split("#")[0])).toBeDefined();
      expect(document.content).not.toContain("::demo{");
    }
    expect(payload.index.records).toHaveLength(payload.documents.length);
    expect(createDocSearch(payload)(name === "docs" ? "闪卡" : "context.pages.register").length).toBeGreaterThan(0);
  });
});
