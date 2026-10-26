import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { headingAnchor } from "../outline.ts";
import { rewriteDocLink, stripDocHeader } from "./loader.ts";
import { developerDocs, docSlugOfFile } from "./manifest.ts";

const docsDir = fileURLToPath(
  new URL("../../../../../plugins/tau-plugin-template/docs/", import.meta.url)
);
const files = readdirSync(docsDir, { recursive: true, encoding: "utf8" })
  .filter(name => name.endsWith(".md"))
  .sort();
const read = (file: string) => readFileSync(docsDir + file, "utf8");
const fileOfSlug = (slug: string) => files.find(file => docSlugOfFile(file) === slug);

describe("插件开发文档目录", () => {
  it("模板子模块已检出", () => {
    expect(
      files,
      "缺少 plugins/tau-plugin-template/docs，请先 git submodule update --init"
    ).not.toHaveLength(0);
  });

  it("目录与模板 docs/ 下的 Markdown 一一对应", () => {
    expect(developerDocs.all.map(entry => entry.slug).sort()).toEqual(
      files.map(docSlugOfFile).sort()
    );
  });

  it("目录标题与正文一级标题一致", () => {
    for (const entry of developerDocs.all.filter(item => item.slug)) {
      const heading = /^#\s+(.+)$/m.exec(read(fileOfSlug(entry.slug)!))?.[1];
      expect(entry.title, entry.slug).toBe(heading);
    }
  });

  it("文档间链接都指向已有文档与标题", () => {
    for (const file of files) {
      for (const [, url] of read(file).matchAll(/\]\(([^)\s]+)\)/g)) {
        const href = rewriteDocLink(url, file);
        if (!href.startsWith(developerDocs.basePath) && !href.startsWith("#")) continue;
        const [path, hash] = href.split("#");
        const target = path
          ? developerDocs.find(path)
          : developerDocs.find(developerDocs.href(docSlugOfFile(file)));
        expect(target, `${file} 链接到 ${url}`).toBeDefined();
        if (!hash) continue;
        const markdown = read(fileOfSlug(target!.slug)!);
        const anchors = Array.from(markdown.matchAll(/^#{2,6}\s+(.+)$/gm), match =>
          headingAnchor(match[1])
        );
        expect(anchors, `${file} 链接到 ${url}`).toContain(decodeURIComponent(hash));
      }
    }
  });
});

describe("rewriteDocLink", () => {
  it("相对链接按当前文件解析成站内地址", () => {
    expect(rewriteDocLink("ui.md", "README.md")).toBe("/developers/ui/");
    expect(rewriteDocLink("user-data.md#插件内容", "README.md")).toBe(
      "/developers/user-data/#插件内容"
    );
    expect(rewriteDocLink("providers/README.md", "README.md")).toBe("/developers/providers/");
    expect(rewriteDocLink("README.md", "providers/asr.md")).toBe("/developers/providers/");
    expect(rewriteDocLink("../site-data.md", "providers/publish.md")).toBe(
      "/developers/site-data/"
    );
    expect(rewriteDocLink("README.md", "ui.md")).toBe("/developers/");
  });

  it("以 / 开头的按模板仓库根解析", () => {
    expect(rewriteDocLink("/docs/websocket.md", "providers/asr.md")).toBe("/developers/websocket/");
  });

  it("仓库里的其他文件指向 GitHub，外链与页内锚点不变", () => {
    expect(rewriteDocLink("../AGENTS.md", "README.md")).toBe(
      "https://github.com/LastKnightCoder/tau-plugin-template/blob/main/AGENTS.md"
    );
    expect(rewriteDocLink("https://example.com/a.md", "ui.md")).toBe("https://example.com/a.md");
    expect(rewriteDocLink("#权限", "user-data.md")).toBe("#权限");
  });
});

describe("stripDocHeader", () => {
  it("去掉生成注释与一级标题，保留正文", () => {
    expect(stripDocHeader("<!-- 生成 -->\n\n# 标题\n\n正文\n\n# 示例里的标题\n")).toBe(
      "\n正文\n\n# 示例里的标题\n"
    );
    expect(stripDocHeader("# 标题\n正文")).toBe("正文");
  });
});

describe("headingAnchor", () => {
  it("与 GitHub 的标题锚点一致", () => {
    expect(headingAnchor("Tau 的界面动作")).toBe("tau-的界面动作");
    expect(headingAnchor("图片、视频与音频")).toBe("图片视频与音频");
  });
});
