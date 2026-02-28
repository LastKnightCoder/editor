import { describe, expect, it } from "vitest";
import {
  buildSelectionContentLinkTargets,
  mergeDocEntryContentLinkTargets,
} from "../publish-content-link-targets";

describe("publish-content-link-targets", () => {
  it("应生成 card/article 的目标索引", () => {
    const targets = buildSelectionContentLinkTargets({
      cardIds: [12],
      articleIds: [34],
    });

    expect(targets).toEqual({
      "card:12": {
        contentType: "card",
        refId: 12,
        href: "/cards/12.html",
      },
      "article:34": {
        contentType: "article",
        refId: 34,
        href: "/articles/34.html",
      },
    });
  });

  it("应合并 project-item/document-item 并保留既有目标", () => {
    const baseTargets = buildSelectionContentLinkTargets({
      cardIds: [1],
      articleIds: [],
    });

    const merged = mergeDocEntryContentLinkTargets(baseTargets, [
      {
        id: 301,
        kind: "project",
        href: "/docs/project/7/301.html",
        title: "项目文档 301",
      },
      {
        id: 401,
        kind: "document",
        href: "/docs/document/9/401.html",
        title: "知识库文档 401",
      },
    ]);

    expect(merged).toEqual({
      "card:1": {
        contentType: "card",
        refId: 1,
        href: "/cards/1.html",
      },
      "project-item:301": {
        contentType: "project-item",
        refId: 301,
        href: "/docs/project/7/301.html",
        title: "项目文档 301",
      },
      "document-item:401": {
        contentType: "document-item",
        refId: 401,
        href: "/docs/document/9/401.html",
        title: "知识库文档 401",
      },
    });
  });
});
