import { App } from "antd";
import { act } from "react";
import type { ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SubscriptionTree from "../SubscriptionTree";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
(globalThis as any).ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

const rssState = vi.hoisted(() => ({
  feeds: [
    {
      id: 1,
      title: "Example Feed",
      url: "https://example.com/feed.xml",
    },
  ],
  subscriptions: [
    {
      id: 10,
      feedId: 1,
      title: "Example Feed",
      category: "技术",
    },
  ],
  categories: ["技术", "产品"],
  unreadCounts: { 1: 3 } as Record<number, number>,
  unsubscribe: vi.fn(),
  subscribeBilibiliFollowings: vi.fn(),
  updateSubscription: vi.fn(),
}));

vi.mock("@/stores/useRssStore", () => ({
  default: (selector: (state: typeof rssState) => unknown) =>
    selector(rssState),
}));

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

const openSubscriptionContextMenu = async (container: HTMLElement) => {
  const subscriptionButton = Array.from(
    container.querySelectorAll("button"),
  ).find((button) => button.textContent?.includes("Example Feed"));
  expect(subscriptionButton).toBeTruthy();

  await act(async () => {
    subscriptionButton?.dispatchEvent(
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

const clickMenuItem = async (label: string) => {
  const item = Array.from(document.body.querySelectorAll("li")).find((node) =>
    node.textContent?.includes(label),
  );
  expect(item).toBeTruthy();

  await act(async () => {
    item?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await flushDropdown();
};

const openBilibiliFollowingsContextMenu = async (container: HTMLElement) => {
  const followingsButton = Array.from(
    container.querySelectorAll("button"),
  ).find(
    (button) =>
      button.textContent?.includes("我订阅的动态") ||
      button.textContent?.includes("我的关注更新"),
  );
  expect(followingsButton).toBeTruthy();

  await act(async () => {
    followingsButton?.dispatchEvent(
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

const clickButton = async (label: string) => {
  const button = Array.from(document.body.querySelectorAll("button")).find(
    (node) => node.textContent?.includes(label),
  );
  expect(button).toBeTruthy();

  await act(async () => {
    button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await flushDropdown();
};

const changeInput = async (input: HTMLInputElement, value: string) => {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;
  setter?.call(input, value);

  await act(async () => {
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
};

const changeTextarea = async (textarea: HTMLTextAreaElement, value: string) => {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLTextAreaElement.prototype,
    "value",
  )?.set;
  setter?.call(textarea, value);

  await act(async () => {
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  });
};

describe("SubscriptionTree", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    vi.clearAllMocks();
    rssState.feeds = [
      {
        id: 1,
        title: "Example Feed",
        url: "https://example.com/feed.xml",
      },
    ];
    rssState.subscriptions = [
      {
        id: 10,
        feedId: 1,
        title: "Example Feed",
        category: "技术",
      },
    ];
    rssState.categories = ["技术", "产品"];
    rssState.unreadCounts = { 1: 3 };
    rssState.subscribeBilibiliFollowings.mockResolvedValue(undefined);
  });

  it("右键订阅项时应展示包含分类操作的 Dropdown 菜单", async () => {
    const { root, container } = await mount(
      <SubscriptionTree
        selection={{ kind: "smart", group: "all" }}
        onSelect={vi.fn()}
      />,
    );

    await openSubscriptionContextMenu(container);

    expect(document.body.textContent).toContain("调整分类");
    expect(document.body.textContent).toContain("重命名");
    expect(document.body.textContent).toContain("取消订阅");

    await unmount(root, container);
  });

  it("应通过弹窗修改普通订阅名称", async () => {
    const { root, container } = await mount(
      <SubscriptionTree
        selection={{ kind: "smart", group: "all" }}
        onSelect={vi.fn()}
      />,
    );

    await openSubscriptionContextMenu(container);
    await clickMenuItem("重命名");

    expect(document.body.textContent).toContain("修改订阅名称");
    expect(document.body.textContent).toContain(
      "设置这个订阅在信息流中的显示名称",
    );

    const textarea = document.body.querySelector(
      'textarea[placeholder="请输入订阅名称"]',
    ) as HTMLTextAreaElement | null;
    expect(textarea).toBeTruthy();
    await changeTextarea(textarea!, "新的订阅名称");
    await clickButton("确认");

    expect(rssState.updateSubscription).toHaveBeenCalledWith(10, {
      title: "新的订阅名称",
    });

    await unmount(root, container);
  });

  it("新建分类应使用自绘弹窗并提交分类名", async () => {
    const { root, container } = await mount(
      <SubscriptionTree
        selection={{ kind: "smart", group: "all" }}
        onSelect={vi.fn()}
      />,
    );

    await openSubscriptionContextMenu(container);
    await clickMenuItem("新建分类");

    expect(document.body.querySelector(".ant-modal")).toBeFalsy();
    expect(document.body.textContent).toContain("新建分类");
    expect(document.body.textContent).toContain("分类名称");
    expect(document.body.textContent).toContain("移动到此分类");

    const input = document.body.querySelector(
      'input[placeholder="输入分类名称"]',
    ) as HTMLInputElement | null;
    expect(input).toBeTruthy();
    await changeInput(input!, "资讯");

    const submitButton = Array.from(
      document.body.querySelectorAll("button"),
    ).find((button) => button.textContent?.includes("移动到此分类"));
    expect(submitButton).toBeTruthy();
    await act(async () => {
      submitButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(rssState.updateSubscription).toHaveBeenCalledWith(10, {
      category: "资讯",
    });

    await unmount(root, container);
  });

  it("应始终在 B 站分类下展示我订阅的动态固定项", async () => {
    rssState.feeds = [];
    rssState.subscriptions = [];
    rssState.categories = [];
    rssState.unreadCounts = {};
    const onSelect = vi.fn();

    const { root, container } = await mount(
      <SubscriptionTree
        selection={{ kind: "smart", group: "all" }}
        onSelect={onSelect}
      />,
    );

    expect(container.textContent).toContain("B 站");
    expect(container.textContent).toContain("我订阅的动态");

    const followingsButton = Array.from(
      container.querySelectorAll("button"),
    ).find((button) => button.textContent?.includes("我订阅的动态"));
    expect(followingsButton).toBeTruthy();
    await act(async () => {
      followingsButton?.dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });

    expect(onSelect).toHaveBeenCalledWith({ kind: "bilibili-followings" });

    await unmount(root, container);
  });

  it("未订阅 B 站动态时右键应提供订阅操作", async () => {
    rssState.feeds = [];
    rssState.subscriptions = [];
    rssState.categories = [];

    const { root, container } = await mount(
      <SubscriptionTree
        selection={{ kind: "smart", group: "all" }}
        onSelect={vi.fn()}
      />,
    );

    await openBilibiliFollowingsContextMenu(container);
    await clickMenuItem("订阅");

    expect(rssState.subscribeBilibiliFollowings).toHaveBeenCalledWith("B 站");

    await unmount(root, container);
  });

  it("已订阅 B 站动态时右键应提供取消订阅操作", async () => {
    rssState.feeds = [
      {
        id: 2,
        title: "我的 Bilibili 关注动态",
        url: "tau://rss/bilibili/followings-dynamic",
      },
    ];
    rssState.subscriptions = [
      {
        id: 20,
        feedId: 2,
        title: "我的 Bilibili 关注动态",
        category: "B 站",
      },
    ];
    rssState.categories = ["B 站"];

    const { root, container } = await mount(
      <SubscriptionTree
        selection={{ kind: "bilibili-followings" }}
        onSelect={vi.fn()}
      />,
    );

    await openBilibiliFollowingsContextMenu(container);

    expect(document.body.textContent).toContain("重命名");
    expect(document.body.textContent).toContain("取消订阅");
    expect(document.body.textContent).not.toContain("订阅订阅");

    await unmount(root, container);
  });

  it("已订阅 B 站动态时应显示自定义订阅名称", async () => {
    rssState.feeds = [
      {
        id: 2,
        title: "我的 Bilibili 关注动态",
        url: "tau://rss/bilibili/followings-dynamic",
      },
    ];
    rssState.subscriptions = [
      {
        id: 20,
        feedId: 2,
        title: "我的关注更新",
        category: "B 站",
      },
    ];
    rssState.categories = ["B 站"];

    const { root, container } = await mount(
      <SubscriptionTree
        selection={{ kind: "bilibili-followings" }}
        onSelect={vi.fn()}
      />,
    );

    expect(container.textContent).toContain("我的关注更新");
    expect(container.textContent).not.toContain("我订阅的动态");

    await unmount(root, container);
  });

  it("应通过弹窗修改 B 站动态订阅名称", async () => {
    rssState.feeds = [
      {
        id: 2,
        title: "我的 Bilibili 关注动态",
        url: "tau://rss/bilibili/followings-dynamic",
      },
    ];
    rssState.subscriptions = [
      {
        id: 20,
        feedId: 2,
        title: "我的 Bilibili 关注动态",
        category: "B 站",
      },
    ];
    rssState.categories = ["B 站"];

    const { root, container } = await mount(
      <SubscriptionTree
        selection={{ kind: "bilibili-followings" }}
        onSelect={vi.fn()}
      />,
    );

    await openBilibiliFollowingsContextMenu(container);
    await clickMenuItem("重命名");

    const textarea = document.body.querySelector(
      'textarea[placeholder="请输入订阅名称"]',
    ) as HTMLTextAreaElement | null;
    expect(textarea).toBeTruthy();
    await changeTextarea(textarea!, "我的关注更新");
    await clickButton("确认");

    expect(rssState.updateSubscription).toHaveBeenCalledWith(20, {
      title: "我的关注更新",
    });

    await unmount(root, container);
  });
});
