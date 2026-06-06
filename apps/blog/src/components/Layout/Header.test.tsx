import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import Header from "./Header";

describe("blog/Header", () => {
  let container: HTMLDivElement;
  let root: Root;
  const originalActEnvironment = (globalThis as Record<string, unknown>)
    .IS_REACT_ACT_ENVIRONMENT;
  const originalMatchMedia = window.matchMedia;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn().mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    });
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    document.body.innerHTML = "";
    (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT =
      originalActEnvironment;
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: originalMatchMedia,
    });
    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      value: originalFetch,
    });
    vi.restoreAllMocks();
  });

  it("提供 RSS 地址时应显示复制入口并写入剪贴板", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    await act(async () => {
      root.render(
        <Header
          title="站点"
          basePath="/blog"
          navigation={[]}
          rssHref="/blog/rss.xml"
        />,
      );
    });

    const rssButton = container.querySelector(
      'button[aria-label="复制 RSS 链接"]',
    ) as HTMLButtonElement | null;
    expect(rssButton).not.toBeNull();

    await act(async () => {
      rssButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(writeText).toHaveBeenCalledWith(
      "http://localhost:3000/blog/rss.xml",
    );
    expect(
      container.querySelector('button[aria-label="RSS 链接已复制"]'),
    ).not.toBeNull();
  });

  it("未提供 RSS 地址时不显示 RSS 入口", async () => {
    await act(async () => {
      root.render(<Header title="站点" basePath="/" navigation={[]} />);
    });

    expect(container.querySelector("[data-rss-href]")).toBeNull();
  });

  it("提供搜索地址时应显示搜索入口，未提供时不显示", async () => {
    await act(async () => {
      root.render(
        <Header
          title="站点"
          basePath="/blog"
          navigation={[]}
          searchHref="/search-index.json"
        />,
      );
    });

    expect(container.querySelector('button[aria-label="搜索"]')).not.toBeNull();

    await act(async () => {
      root.render(<Header title="站点" basePath="/blog" navigation={[]} />);
    });

    expect(container.querySelector('button[aria-label="搜索"]')).toBeNull();
  });

  it("按 Ctrl+K 时应打开搜索弹层", async () => {
    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      value: vi.fn().mockRejectedValue(new Error("not found")),
    });

    await act(async () => {
      root.render(
        <Header
          title="站点"
          basePath="/blog"
          navigation={[]}
          searchHref="/search-index.json"
        />,
      );
    });

    await act(async () => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "k",
          ctrlKey: true,
          bubbles: true,
        }),
      );
    });

    expect(document.body.querySelector('[role="dialog"]')).not.toBeNull();
    expect(
      document.body.querySelector('input[aria-label="搜索关键词"]'),
    ).not.toBeNull();
  });
});
