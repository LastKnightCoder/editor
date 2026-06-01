import { describe, expect, it } from "vitest";
import { EProjectItemType, type ProjectItem, type WebLink } from "@/types";
import type { UnifiedArticleItem } from "../../types";
import { resolveArticleProjectTargets } from "../articleProjectTargets";

const createArticle = (
  overrides: Partial<UnifiedArticleItem>,
): UnifiedArticleItem => ({
  id: "rss-1",
  source: "rss",
  sourceId: 1,
  title: "文章",
  url: "https://example.com/post",
  excerpt: null,
  author: null,
  publishedAt: null,
  isRead: false,
  isStarred: false,
  isArchived: false,
  badge: "RSS",
  content: null,
  ...overrides,
});

const createProjectItem = (overrides: Partial<ProjectItem>): ProjectItem => ({
  id: 10,
  createTime: 1,
  updateTime: 1,
  title: "项目里的网页",
  content: [],
  children: [],
  parents: [],
  projects: [100],
  refType: "web-link",
  refId: 200,
  projectItemType: EProjectItemType.WebView,
  count: 0,
  contentId: 0,
  whiteBoardContentId: 0,
  ...overrides,
});

const createWebLink = (overrides: Partial<WebLink>): WebLink => ({
  id: 200,
  title: "项目里的网页",
  url: "https://example.com/post/",
  sourceType: "remote",
  createTime: 1,
  updateTime: 1,
  ...overrides,
});

describe("resolveArticleProjectTargets", () => {
  it("按 URL 匹配已作为 WebView 加入项目的文章", () => {
    const targets = resolveArticleProjectTargets(
      [createArticle({ id: "rss-1", url: "https://example.com/post#top" })],
      [createProjectItem({ id: 10, projects: [100], refId: 200 })],
      [createWebLink({ id: 200, url: "https://example.com/post/" })],
    );

    expect(targets["rss-1"]).toEqual({
      projectId: 100,
      itemId: 10,
      title: "项目里的网页",
    });
  });

  it("忽略非 WebView 或未挂到项目中的项目项", () => {
    const targets = resolveArticleProjectTargets(
      [createArticle({ id: "rss-1" })],
      [
        createProjectItem({
          id: 10,
          projectItemType: EProjectItemType.Document,
        }),
        createProjectItem({ id: 11, projects: [] }),
      ],
      [createWebLink({ id: 200 })],
    );

    expect(targets).toEqual({});
  });
});
