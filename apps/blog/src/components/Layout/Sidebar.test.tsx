import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DocSidebar } from "./Sidebar";

describe("blog/DocSidebar", () => {
  let container: HTMLDivElement;
  let root: Root;
  const originalActEnvironment = (globalThis as Record<string, unknown>)
    .IS_REACT_ACT_ENVIRONMENT;

  beforeEach(() => {
    (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
    window.localStorage.clear();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    document.body.innerHTML = "";
    (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT =
      originalActEnvironment;
    vi.restoreAllMocks();
  });

  it("点击带链接的分组标题时不应误切换折叠状态", async () => {
    await act(async () => {
      root.render(
        <DocSidebar
          basePath="/"
          currentPath="/docs/group.html"
          storageKey="test:sidebar"
          items={[
            {
              title: "分组",
              href: "/docs/group.html",
              children: [{ title: "子页", href: "/docs/group/child.html" }],
            },
          ]}
        />,
      );
    });

    const link = Array.from(container.querySelectorAll("a")).find(
      (element) => element.textContent?.trim() === "分组",
    );
    expect(link).not.toBeNull();

    const toggleButton = container.querySelector(
      'button[aria-label="收起分组"]',
    ) as HTMLButtonElement | null;
    expect(toggleButton).not.toBeNull();
    expect(toggleButton?.getAttribute("aria-expanded")).toBe("true");
    link?.addEventListener("click", (event) => event.preventDefault(), {
      once: true,
    });

    await act(async () => {
      link?.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true }),
      );
    });

    expect(toggleButton?.getAttribute("aria-expanded")).toBe("true");
  });

  it("展开长分组时应使用真实内容高度而不是固定高度截断", async () => {
    await act(async () => {
      root.render(
        <DocSidebar
          basePath="/"
          storageKey="test:sidebar-height"
          items={[
            {
              title: "长分组",
              collapsed: true,
              children: Array.from({ length: 3 }, (_, index) => ({
                title: `子页 ${index + 1}`,
                href: `/docs/item-${index + 1}.html`,
              })),
            },
          ]}
        />,
      );
    });

    const toggleButton = container.querySelector(
      'button[aria-label="展开分组"]',
    ) as HTMLButtonElement | null;
    const contentWrapper = toggleButton?.parentElement?.nextElementSibling
      ?.firstElementChild as HTMLElement | null;
    const animatedContainer =
      contentWrapper?.parentElement as HTMLElement | null;
    expect(contentWrapper).not.toBeNull();
    expect(animatedContainer).not.toBeNull();

    Object.defineProperty(contentWrapper, "scrollHeight", {
      configurable: true,
      value: 1600,
    });

    await act(async () => {
      toggleButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(animatedContainer?.style.maxHeight).toBe("1600px");
  });

  it("首次进入且无手动状态时，应静默展开当前页面所在分组", async () => {
    await act(async () => {
      root.render(
        <DocSidebar
          basePath="/"
          currentPath="/docs/group/child.html"
          storageKey="test:sidebar-auto-open"
          items={[
            {
              title: "分组",
              href: "/docs/group.html",
              collapsed: true,
              children: [{ title: "子页", href: "/docs/group/child.html" }],
            },
          ]}
        />,
      );
    });

    const toggleButton = container.querySelector(
      'button[aria-label="收起分组"]',
    ) as HTMLButtonElement | null;
    expect(toggleButton).not.toBeNull();
    expect(toggleButton?.getAttribute("aria-expanded")).toBe("true");
  });

  it("用户手动收起后再跳转到当前分组子页时，不应再次自动展开", async () => {
    const items = [
      {
        title: "分组",
        href: "/docs/group.html",
        collapsed: true,
        children: [{ title: "子页", href: "/docs/group/child.html" }],
      },
    ];

    await act(async () => {
      root.render(
        <DocSidebar
          basePath="/"
          currentPath="/docs/group/child.html"
          storageKey="test:sidebar-auto-open"
          items={items}
        />,
      );
    });

    const collapseButton = container.querySelector(
      'button[aria-label="收起分组"]',
    ) as HTMLButtonElement | null;
    expect(collapseButton).not.toBeNull();

    await act(async () => {
      collapseButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    await act(async () => {
      root.render(
        <DocSidebar
          basePath="/"
          currentPath="/docs/group/child.html"
          storageKey="test:sidebar-auto-open"
          items={items}
        />,
      );
    });

    const expandButton = container.querySelector(
      'button[aria-label="展开分组"]',
    ) as HTMLButtonElement | null;
    expect(expandButton).not.toBeNull();
    expect(expandButton?.getAttribute("aria-expanded")).toBe("false");
  });

  it("首次渲染展开分组时不应触发展开动画，避免页面跳转时闪一下", async () => {
    await act(async () => {
      root.render(
        <DocSidebar
          basePath="/"
          storageKey="test:sidebar-initial-motion"
          items={[
            {
              title: "默认展开分组",
              collapsed: false,
              children: [{ title: "子页", href: "/docs/child.html" }],
            },
          ]}
        />,
      );
    });

    const toggleButton = container.querySelector(
      'button[aria-label="收起分组"]',
    ) as HTMLButtonElement | null;
    const animatedContainer = toggleButton?.parentElement
      ?.nextElementSibling as HTMLElement | null;
    expect(animatedContainer).not.toBeNull();
    expect(animatedContainer?.className).not.toContain("transition-all");
  });
});
