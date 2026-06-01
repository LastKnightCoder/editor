import { describe, expect, it } from "vitest";

import {
  buildFeedUrl,
  escapeXml,
  generateRssXml,
  injectPublishRssLink,
  normalizePublicUrl,
  type IPublishFeedItem,
} from "../publish-rss";

const site = {
  title: "我的博客",
  description: "记录学习与思考",
  basePath: "/blog/",
  publicUrl: "https://example.com/",
};

describe("publish-rss", () => {
  it("应规范化公开 URL 并拒绝非 http 协议", () => {
    expect(normalizePublicUrl(" https://example.com/blog/ ")).toBe(
      "https://example.com/blog",
    );
    expect(normalizePublicUrl("ftp://example.com")).toBe("");
    expect(normalizePublicUrl("")).toBe("");
  });

  it("应转义 XML 特殊字符", () => {
    expect(escapeXml(`A&B <C> "D" 'E'`)).toBe(
      "A&amp;B &lt;C&gt; &quot;D&quot; &apos;E&apos;",
    );
  });

  it("公开 URL 存在时应生成绝对链接", () => {
    expect(buildFeedUrl(site, "/articles/1.html")).toBe(
      "https://example.com/blog/articles/1.html",
    );
  });

  it("公开 URL 缺失时应降级为站内路径", () => {
    expect(
      buildFeedUrl(
        {
          ...site,
          publicUrl: "",
        },
        "/articles/1.html",
      ),
    ).toBe("/blog/articles/1.html");
  });

  it("应按更新时间或发布时间倒序生成文章、卡片、文档条目", () => {
    const items: IPublishFeedItem[] = [
      {
        type: "article",
        id: 1,
        title: `文章 & 标题`,
        summary: "文章摘要",
        href: "/articles/1.html",
        tags: ["技术"],
        publishTime: 1000,
        updateTime: 1000,
        author: "作者",
      },
      {
        type: "card",
        id: 2,
        title: "卡片 #2",
        summary: "卡片摘要",
        href: "/cards/2.html",
        tags: ["卡片"],
        publishTime: 2000,
        updateTime: 5000,
      },
      {
        type: "doc",
        id: 3,
        title: "知识库文档",
        summary: "文档摘要",
        href: "/docs/document/9/3.html",
        tags: [],
        publishTime: 3000,
        updateTime: 3000,
      },
    ];

    const xml = generateRssXml(site, items);

    expect(xml).toContain('<rss version="2.0"');
    expect(xml).toContain("<channel>");
    expect(xml).toContain("<title>我的博客</title>");
    expect(xml).toContain("<link>https://example.com/blog/</link>");
    expect(xml).toContain("<title>文章 &amp; 标题</title>");
    expect(xml).toContain("<author>作者</author>");
    expect(xml).toContain("<category>技术</category>");
    expect(xml).toContain("<link>https://example.com/blog/cards/2.html</link>");
    expect(xml).toContain(
      "<link>https://example.com/blog/docs/document/9/3.html</link>",
    );

    const cardIndex = xml.indexOf("<title>卡片 #2</title>");
    const docIndex = xml.indexOf("<title>知识库文档</title>");
    const articleIndex = xml.indexOf("<title>文章 &amp; 标题</title>");
    expect(cardIndex).toBeGreaterThan(-1);
    expect(docIndex).toBeGreaterThan(cardIndex);
    expect(articleIndex).toBeGreaterThan(docIndex);
  });

  it("应在 head 中注入 RSS 发现链接并保留已有 favicon", () => {
    const html = `<html><head><link rel="icon" href="/favicon.ico" /></head><body></body></html>`;

    const injected = injectPublishRssLink(html, "https://example.com/rss.xml");

    expect(injected).toContain(`<link rel="icon" href="/favicon.ico" />`);
    expect(injected).toContain(
      `<link rel="alternate" type="application/rss+xml" title="RSS" href="https://example.com/rss.xml" />`,
    );
    expect(injected.indexOf('rel="alternate"')).toBeLessThan(
      injected.indexOf("</head>"),
    );
  });
});
