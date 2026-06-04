import { act } from "react";
import type { ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ArticleListHeader from "../ArticleListHeader";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const rssStoreMock = vi.hoisted(() => ({
  feeds: [
    {
      id: 1,
      url: "tau://rss/bilibili/followings-dynamic",
      title: "我的 Bilibili 关注动态",
    },
  ],
  subscriptions: [{ id: 1, feedId: 1, title: "我的 Bilibili 关注动态" }],
  isRefreshing: false,
}));

vi.mock("@/stores/useRssStore", () => ({
  default: (selector?: (state: typeof rssStoreMock) => unknown) =>
    selector ? selector(rssStoreMock) : rssStoreMock,
}));

const mount = async (node: ReactNode) => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(node);
  });

  return { root, container };
};

const unmount = async (root: Root, container: HTMLElement) => {
  await act(async () => {
    root.unmount();
  });
  container.remove();
};

describe("ArticleListHeader", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    rssStoreMock.isRefreshing = false;
  });

  it("B 站关注动态已订阅时应显示全部已读按钮", async () => {
    const onMarkAllRead = vi.fn();
    const { root, container } = await mount(
      <ArticleListHeader
        selection={{ kind: "bilibili-followings" }}
        articleCount={12}
        search=""
        onSearchChange={vi.fn()}
        onMarkAllRead={onMarkAllRead}
        onRefresh={vi.fn()}
      />,
    );

    const markAllReadButton = document.body.querySelector(
      'button[title="全部已读"]',
    );
    expect(markAllReadButton).toBeTruthy();

    await act(async () => {
      markAllReadButton?.dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });

    expect(onMarkAllRead).toHaveBeenCalledTimes(1);

    await unmount(root, container);
  });
});
