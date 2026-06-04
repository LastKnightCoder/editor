import { act } from "react";
import type { ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "antd";
import ArticleListItem from "../ArticleListItem";
import type { UnifiedArticleItem } from "../../../types";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
(globalThis as any).ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
vi.spyOn(window, "getComputedStyle").mockImplementation(
  () =>
    ({
      getPropertyValue: () => "",
    }) as unknown as CSSStyleDeclaration,
);

const confirmMock = vi.hoisted(() => vi.fn());

vi.mock("antd", async (importOriginal) => {
  const antd = await importOriginal<typeof import("antd")>();
  return {
    ...antd,
    App: Object.assign(antd.App, {
      useApp: () => ({
        modal: { confirm: confirmMock },
        message: {
          error: vi.fn(),
          success: vi.fn(),
        },
      }),
    }),
  };
});

const rssArticle: UnifiedArticleItem = {
  id: "rss-1",
  source: "rss",
  sourceId: 1,
  title: "一篇 RSS 文章",
  url: "https://example.com/a",
  excerpt: "文章摘要",
  author: "作者",
  publishedAt: 1710000000000,
  isRead: false,
  isStarred: false,
  isArchived: false,
  badge: "Example",
  content: "<p>正文</p>",
  readabilityContent: null,
  feedId: 10,
};

const readLaterArticle: UnifiedArticleItem = {
  id: "readlater-2",
  source: "readlater",
  sourceId: 2,
  title: "一篇稍后读文章",
  url: "https://example.com/b",
  excerpt: "稍后读摘要",
  author: null,
  publishedAt: null,
  isRead: true,
  isStarred: true,
  isArchived: false,
  badge: "稍后读",
  content: "<p>正文</p>",
  readabilityContent: null,
};

const bilibiliVideoArticle: UnifiedArticleItem = {
  ...rssArticle,
  id: "rss-3",
  sourceId: 3,
  title: "一个 B 站视频",
  url: "https://www.bilibili.com/video/BV1abc",
};

const mount = async (node: ReactNode) => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(<App>{node}</App>);
  });

  return { root, container };
};

const unmount = async (root: Root, container: HTMLElement) => {
  await act(async () => {
    root.unmount();
  });
  container.remove();
};

const flushDropdown = async () => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
};

const openContextMenu = async (container: HTMLElement, title: string) => {
  const itemNode = Array.from(container.querySelectorAll("div")).find(
    (node) =>
      node.className.includes("cursor-pointer") &&
      node.textContent?.includes(title),
  );
  expect(itemNode).toBeTruthy();

  await act(async () => {
    itemNode?.dispatchEvent(
      new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        clientX: 20,
        clientY: 20,
      }),
    );
  });
  await flushDropdown();
};

describe("ArticleListItem", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    vi.clearAllMocks();
  });

  it("右键 RSS 文章时应展示文章操作菜单并调用对应动作", async () => {
    const onToggleStar = vi.fn();
    const onMarkRead = vi.fn();
    const onToggleReadLater = vi.fn();
    const onDelete = vi.fn();

    const { root, container } = await mount(
      <ArticleListItem
        item={rssArticle}
        isActive={false}
        onClick={vi.fn()}
        {...({
          onToggleStar,
          onMarkRead,
          onToggleReadLater,
          onDelete,
        } as any)}
      />,
    );

    await openContextMenu(container, rssArticle.title);

    expect(document.body.textContent).toContain("收藏");
    expect(document.body.textContent).toContain("稍后读");
    expect(document.body.textContent).toContain("标记为已读");
    expect(document.body.textContent).toContain("删除");

    const favoriteItem = Array.from(document.body.querySelectorAll("li")).find(
      (item) => item.textContent?.includes("收藏"),
    );
    expect(favoriteItem).toBeTruthy();
    await act(async () => {
      favoriteItem?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onToggleStar).toHaveBeenCalledWith(rssArticle);

    const deleteItem = Array.from(document.body.querySelectorAll("li")).find(
      (item) => item.textContent?.includes("删除"),
    );
    expect(deleteItem).toBeTruthy();
    await act(async () => {
      deleteItem?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flushDropdown();

    expect(confirmMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "删除文章",
        okText: "删除",
        cancelText: "取消",
      }),
    );
    expect(onDelete).not.toHaveBeenCalledWith(rssArticle);

    await act(async () => {
      await confirmMock.mock.calls.at(-1)?.[0].onOk();
    });

    expect(onDelete).toHaveBeenCalledWith(rssArticle);

    await unmount(root, container);
  });

  it("右键已读 RSS 文章时应支持重新标记为未读", async () => {
    const onMarkUnread = vi.fn();
    const readArticle = { ...rssArticle, isRead: true };

    const { root, container } = await mount(
      <ArticleListItem
        item={readArticle}
        isActive={false}
        onClick={vi.fn()}
        onMarkUnread={onMarkUnread}
      />,
    );

    await openContextMenu(container, readArticle.title);

    expect(document.body.textContent).toContain("标记为未读");
    expect(document.body.textContent).not.toContain("标记为已读");

    const markUnreadItem = Array.from(
      document.body.querySelectorAll("li"),
    ).find((item) => item.textContent?.includes("标记为未读"));
    expect(markUnreadItem).toBeTruthy();
    await act(async () => {
      markUnreadItem?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onMarkUnread).toHaveBeenCalledWith(readArticle);

    await unmount(root, container);
  });

  it("右键稍后读文章时应展示归档和删除操作", async () => {
    const onArchive = vi.fn();
    const onDelete = vi.fn();

    const { root, container } = await mount(
      <ArticleListItem
        item={readLaterArticle}
        isActive={false}
        onClick={vi.fn()}
        onToggleStar={vi.fn()}
        onArchive={onArchive}
        onDelete={onDelete}
      />,
    );

    await openContextMenu(container, readLaterArticle.title);

    expect(document.body.textContent).toContain("取消收藏");
    expect(document.body.textContent).toContain("归档");
    expect(document.body.textContent).toContain("删除");

    const deleteItem = Array.from(document.body.querySelectorAll("li")).find(
      (item) => item.textContent?.includes("删除"),
    );
    expect(deleteItem).toBeTruthy();
    await act(async () => {
      deleteItem?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flushDropdown();

    expect(confirmMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "删除文章",
        okText: "删除",
        cancelText: "取消",
      }),
    );
    expect(onDelete).not.toHaveBeenCalledWith(readLaterArticle);

    await act(async () => {
      await confirmMock.mock.calls.at(-1)?.[0].onOk();
    });

    expect(onDelete).toHaveBeenCalledWith(readLaterArticle);

    await unmount(root, container);
  });

  it("右键可添加的文章时应展示添加到项目文档操作", async () => {
    const onAddToProject = vi.fn();

    const { root, container } = await mount(
      <ArticleListItem
        item={rssArticle}
        isActive={false}
        onClick={vi.fn()}
        onAddToProject={onAddToProject}
      />,
    );

    await openContextMenu(container, rssArticle.title);

    expect(document.body.textContent).toContain("添加到项目文档");

    const addItem = Array.from(document.body.querySelectorAll("li")).find(
      (item) => item.textContent?.includes("添加到项目文档"),
    );
    expect(addItem).toBeTruthy();
    await act(async () => {
      addItem?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onAddToProject).toHaveBeenCalledWith(rssArticle);

    await unmount(root, container);
  });

  it("右键 B 站视频文章时应展示添加到项目视频笔记操作", async () => {
    const onAddToProject = vi.fn();

    const { root, container } = await mount(
      <ArticleListItem
        item={bilibiliVideoArticle}
        isActive={false}
        onClick={vi.fn()}
        onAddToProject={onAddToProject}
      />,
    );

    await openContextMenu(container, bilibiliVideoArticle.title);

    expect(document.body.textContent).toContain("添加到项目视频笔记");
    expect(document.body.textContent).not.toContain("添加到项目文档");

    const addItem = Array.from(document.body.querySelectorAll("li")).find(
      (item) => item.textContent?.includes("添加到项目视频笔记"),
    );
    expect(addItem).toBeTruthy();
    await act(async () => {
      addItem?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onAddToProject).toHaveBeenCalledWith(bilibiliVideoArticle);

    await unmount(root, container);
  });

  it("右键已添加到项目的文章时应展示打开所在项目操作", async () => {
    const onOpenProject = vi.fn();
    const projectTarget = { projectId: 12, itemId: 34, title: "项目文档" };

    const { root, container } = await mount(
      <ArticleListItem
        item={readLaterArticle}
        isActive={false}
        onClick={vi.fn()}
        projectTarget={projectTarget}
        onOpenProject={onOpenProject}
      />,
    );

    await openContextMenu(container, readLaterArticle.title);

    expect(document.body.textContent).toContain("打开所在项目");

    const openItem = Array.from(document.body.querySelectorAll("li")).find(
      (item) => item.textContent?.includes("打开所在项目"),
    );
    expect(openItem).toBeTruthy();
    await act(async () => {
      openItem?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onOpenProject).toHaveBeenCalledWith(projectTarget);

    await unmount(root, container);
  });
});
