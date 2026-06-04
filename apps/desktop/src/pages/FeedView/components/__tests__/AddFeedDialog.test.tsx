import { act } from "react";
import type { ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AddFeedDialog from "../AddFeedDialog";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const rssStoreMock = vi.hoisted(() => ({
  categories: ["技术"],
  subscribe: vi.fn(),
  discoverFeeds: vi.fn(),
  previewFeed: vi.fn(),
}));

vi.mock("@/stores/useRssStore", () => ({
  default: () => rssStoreMock,
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

const clickButton = async (label: string) => {
  const button = Array.from(document.body.querySelectorAll("button")).find(
    (item) => item.textContent?.includes(label),
  );
  expect(button).toBeTruthy();

  await act(async () => {
    button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
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

const getInputByPlaceholder = (placeholder: string) => {
  const input = Array.from(document.body.querySelectorAll("input")).find(
    (item) => item.placeholder === placeholder,
  );
  expect(input).toBeTruthy();
  return input as HTMLInputElement;
};

describe("AddFeedDialog", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    vi.clearAllMocks();
    rssStoreMock.discoverFeeds.mockResolvedValue([]);
    rssStoreMock.previewFeed.mockResolvedValue({
      valid: false,
      url: "https://example.com",
      errorCode: "not_feed",
      message: "响应不是合法的 RSS/Atom 源",
    });
  });

  it("应只展示一个主入口，而不是并列展示发现和验证两个动作", async () => {
    const { root, container } = await mount(
      <AddFeedDialog open onClose={vi.fn()} />,
    );

    expect(document.body.textContent).toContain("发现 Feed");
    expect(document.body.textContent).not.toContain("验证地址");

    await unmount(root, container);
  });

  it("发现到唯一 Feed 时应自动进入预览", async () => {
    rssStoreMock.discoverFeeds.mockResolvedValue([
      {
        url: "https://example.com/feed.xml",
        title: "Example Feed",
        type: "rss",
      },
    ]);
    rssStoreMock.previewFeed.mockResolvedValue({
      valid: true,
      url: "https://example.com/feed.xml",
      finalUrl: "https://example.com/feed.xml",
      title: "Example Feed",
      siteUrl: "https://example.com",
      description: "Example description",
      feedType: "rss",
      entriesPreview: [
        {
          title: "第一篇文章",
          url: "https://example.com/a",
          publishedAt: null,
        },
      ],
    });

    const { root, container } = await mount(
      <AddFeedDialog open onClose={vi.fn()} />,
    );

    const urlInput = getInputByPlaceholder("输入网站或 Feed URL");
    await changeInput(urlInput, "https://example.com");

    await clickButton("发现 Feed");

    expect(rssStoreMock.discoverFeeds).toHaveBeenCalledWith(
      "https://example.com",
    );
    expect(rssStoreMock.previewFeed).toHaveBeenCalledWith(
      "https://example.com/feed.xml",
    );
    expect(document.body.textContent).toContain("Feed 预览");
    expect(document.body.textContent).toContain("第一篇文章");
    expect(document.body.textContent).toContain("订阅此 Feed");

    await unmount(root, container);
  });

  it("不应在添加订阅弹窗展示 B 站关注动态入口", async () => {
    const { root, container } = await mount(
      <AddFeedDialog open onClose={vi.fn()} />,
    );

    expect(document.body.textContent).not.toContain("订阅我的 B 站关注动态");

    await unmount(root, container);
  });

  it("发现到 B 站本地源时不应自动预览，避免提前触发 B 站风控", async () => {
    rssStoreMock.discoverFeeds.mockResolvedValue([
      {
        url: "tau://rss/bilibili/user-dynamic/342646",
        title: "Bilibili UP 342646 动态",
        type: "rss",
      },
    ]);

    const { root, container } = await mount(
      <AddFeedDialog open onClose={vi.fn()} />,
    );

    const urlInput = getInputByPlaceholder("输入网站或 Feed URL");
    await changeInput(urlInput, "https://space.bilibili.com/342646");

    await clickButton("发现 Feed");

    expect(rssStoreMock.previewFeed).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("Bilibili UP 342646 动态");
    expect(document.body.textContent).toContain("订阅");

    await unmount(root, container);
  });

  it("分类选择应使用共享下拉并把选中分类用于订阅", async () => {
    rssStoreMock.discoverFeeds.mockResolvedValue([
      {
        url: "tau://rss/bilibili/user-dynamic/342646",
        title: "Bilibili UP 342646 动态",
        type: "rss",
      },
    ]);
    rssStoreMock.subscribe.mockResolvedValue(undefined);

    const { root, container } = await mount(
      <AddFeedDialog open onClose={vi.fn()} />,
    );

    const categoryInput = getInputByPlaceholder("输入或选择分类");
    const categoryToggle = document.body.querySelector(
      'button[aria-label="选择分类"]',
    );
    expect(categoryToggle).toBeTruthy();
    await act(async () => {
      categoryToggle?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(document.body.textContent).toContain("技术");

    const categoryItem = Array.from(document.body.querySelectorAll("div")).find(
      (item) => item.textContent === "技术",
    );
    expect(categoryItem).toBeTruthy();
    await act(async () => {
      (categoryItem?.parentElement || categoryItem)?.dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });
    expect(categoryInput.value).toBe("技术");

    const urlInput = getInputByPlaceholder("输入网站或 Feed URL");
    await changeInput(urlInput, "https://space.bilibili.com/342646");
    await clickButton("发现 Feed");
    await clickButton("订阅");

    expect(rssStoreMock.subscribe).toHaveBeenCalledWith(
      "tau://rss/bilibili/user-dynamic/342646",
      "技术",
      "Bilibili UP 342646 动态",
    );

    await unmount(root, container);
  });
});
