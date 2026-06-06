import { act } from "react";
import type { ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import DocPage from "./DocPage";
import { mockDocPageSidebarDemoData } from "@blog/mock/data";

vi.mock("@tau/editor", () => ({
  Editor: () => <div data-slate-editor="true" />,
  EditorServicesProvider: ({ children }: { children: ReactNode }) => (
    <>{children}</>
  ),
}));

vi.mock("@blog/components/Outline", () => ({
  default: () => null,
}));

vi.mock("@blog/components/Common", () => ({
  Breadcrumb: ({ items }: { items: { label: string }[] }) => (
    <nav>{items.map((item) => item.label).join(" / ")}</nav>
  ),
  ScrollToTop: () => null,
}));

vi.mock("@blog/components/DndProvider", () => ({
  default: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock("@blog/editorExtensions", () => ({
  blogEditorExtensions: [],
}));

vi.mock("@blog/services/editorServices", () => ({
  createBlogEditorServices: () => ({}),
}));

describe("DocPage", () => {
  let container: HTMLDivElement;
  let root: Root;
  const originalActEnvironment = (globalThis as Record<string, unknown>)
    .IS_REACT_ACT_ENVIRONMENT;

  beforeEach(() => {
    (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
    window.matchMedia = vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    HTMLElement.prototype.scrollIntoView = vi.fn();
    window.localStorage.clear();
    window._INIT_DATA_ = mockDocPageSidebarDemoData;
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

  it("移动端 Header 菜单应包含当前文档树导航", async () => {
    await act(async () => {
      root.render(<DocPage />);
    });

    const menuButton = container.querySelector(
      'button[aria-label="菜单"]',
    ) as HTMLButtonElement | null;
    expect(menuButton).not.toBeNull();

    await act(async () => {
      menuButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(menuButton?.getAttribute("aria-expanded")).toBe("true");
    expect(container.textContent).toContain("知识库");
    expect(container.textContent).toContain("0.4");
    expect(container.textContent).toContain("0.4.4");
    expect(container.querySelectorAll("aside").length).toBeGreaterThanOrEqual(
      2,
    );
  });
});
