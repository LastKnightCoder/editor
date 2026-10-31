import Fuse from "fuse.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DOC_SEARCH_KEYS, type DocSearchPayload } from "./searchIndex.ts";
import { createDocSearch, loadDocSearch, searchTextParts } from "./search.ts";

const documents = [
  {
    href: "/docs/plugins/#命令注册",
    title: "插件",
    section: "命令注册",
    summary: "",
    group: "扩展",
    content: "说明".repeat(80) + "使用 context.commands.register 注册命令。",
  },
  {
    href: "/docs/cards/",
    title: "卡片",
    section: "",
    summary: "整理知识",
    group: "输出",
    content: "为知识添加标签",
  },
];
const payload: DocSearchPayload = {
  version: 1,
  basePath: "/docs/",
  documents,
  index: Fuse.createIndex(DOC_SEARCH_KEYS, documents).toJSON(),
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("文档本地搜索", () => {
  it("恢复预生成索引，支持中文、拼写容错及正文后部 API 搜索", () => {
    const createIndex = vi.spyOn(Fuse, "createIndex");
    const search = createDocSearch(JSON.parse(JSON.stringify(payload)));
    expect(search("  卡片  ")[0].item.href).toBe("/docs/cards/");
    expect(search("命令注测")[0].item.section).toBe("命令注册");
    expect(search("context.commands.register")[0].item.href).toContain("#命令注册");
    expect(search("   ")).toEqual([]);
    expect(search("zzzzzzzzzzzzzzzzzzzzzzzzzzzzz")).toEqual([]);
    expect(createIndex).not.toHaveBeenCalled();
  });

  it("同一个索引只加载一次，并在失败后允许重试", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response("", { status: 503 }))
      .mockResolvedValueOnce(Response.json(payload));
    vi.stubGlobal("fetch", fetcher);
    const failed = loadDocSearch("/retry-search.json", "/docs/");
    expect(loadDocSearch("/retry-search.json", "/docs/")).toBe(failed);
    await expect(failed).rejects.toThrow("503");
    const search = await loadDocSearch("/retry-search.json", "/docs/");
    expect(search("卡片")).toHaveLength(1);
    expect(await loadDocSearch("/retry-search.json", "/docs/")).toBe(search);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("拒绝另一文档集的索引和未知格式", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json(payload))
      .mockResolvedValueOnce(Response.json({ ...payload, version: 2 }));
    vi.stubGlobal("fetch", fetcher);
    await expect(loadDocSearch("/wrong-collection.json", "/developers/")).rejects.toThrow("不匹配");
    await expect(loadDocSearch("/wrong-version.json", "/docs/")).rejects.toThrow("不匹配");
  });
});

describe("搜索高亮与摘要", () => {
  it("短标题保留完整文本，闭区间包含末字", () => {
    expect(searchTextParts("下载与安装", [[3, 4]])).toEqual([
      { text: "下载与", match: false },
      { text: "安装", match: true },
    ]);
  });

  it("正文摘要围绕命中截断，重叠区间不重复文字", () => {
    const text = "前".repeat(200) + "context.pages.register" + "后".repeat(200);
    const parts = searchTextParts(
      text,
      [
        [200, 206],
        [205, 220],
      ],
      100
    );
    expect(
      parts
        .filter(part => part.match)
        .map(part => part.text)
        .join("")
    ).toBe("context.pages.registe");
    expect(parts[0].text).toBe("…");
    expect(parts.at(-1)?.text).toBe("…");
    expect(parts.map(part => part.text).join("").length).toBe(102);
  });

  it("无命中时返回开头摘要，纯文本保留 HTML 字符", () => {
    expect(searchTextParts("<script>alert(1)</script>", [], 8)).toEqual([
      { text: "<script>", match: false },
      { text: "…", match: false },
    ]);
  });
});
