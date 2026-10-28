// 引用预览面板：载入后显示类型、更新时间与「打开」；内容已删除显示失效；协作者视角不查本机库。

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
vi.mock("../../../router", () => ({ getNavigator: () => ({ push }) }));

const getContentDetail = vi.fn();
const metadata = vi.hoisted(() => vi.fn());
const pluginOpen = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock("../../../services/pluginEntities", () => ({
  getMobilePluginEntityMetadata: metadata,
  openMobilePluginEntity: pluginOpen,
  useMobileEntityHostRevision: () => 1,
}));
vi.mock("../../../services/tauri", () => ({
  getContentDetail: (...args: unknown[]) => getContentDetail(...args),
}));

const collaboration = vi.hoisted(() => ({
  value: undefined as { mode?: string; role?: string } | undefined,
}));
vi.mock("@tau/editor-collab", () => ({ useCollaboration: () => collaboration.value }));

// 预览正文的编辑器与 kit 懒加载，这里换成占位
vi.mock("@tau/editor", () => ({ Editor: () => <div data-testid="preview-editor" /> }));
vi.mock("../../../services/editorKit", () => ({ getMobileContentKit: () => ({}) }));

import { ContentLinkPreviewSheet } from "../editorExtensions/ContentLinkPreviewSheet";
import type { ContentLinkTarget } from "../editorExtensions/contentLinkModel";

const target: ContentLinkTarget = {
  contentId: 100,
  contentType: "card",
  contentTitle: "艾宾浩斯遗忘曲线",
  refId: 12,
};

let root: Root | null = null;

async function renderSheet(onClose = vi.fn(), selected = target) {
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await act(async () =>
    root!.render(
      <QueryClientProvider client={client}>
        <ContentLinkPreviewSheet open target={selected} onClose={onClose} />
      </QueryClientProvider>
    )
  );
  // 等详情查询与懒加载的预览编辑器落定
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 0));
  });
  return onClose;
}

const findButton = (text: string) =>
  [...document.querySelectorAll("button")].find(button => button.textContent?.includes(text));

describe("ContentLinkPreviewSheet", () => {
  beforeEach(() => {
    collaboration.value = undefined;
    push.mockReset();
    getContentDetail.mockReset();
    metadata.mockReset();
    pluginOpen.mockClear();
  });

  it("插件实体已删除时即使正文仍保留也显示失效，不读取残留正文", async () => {
    metadata.mockResolvedValue(null);
    getContentDetail.mockResolvedValue({ contentId: 100, content: [], count: 1 });
    await renderSheet(vi.fn(), { ...target, contentType: "plugin-entity" });
    expect(metadata).toHaveBeenCalledWith(12, 100);
    expect(getContentDetail).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("引用已失效");
    expect(findButton("打开")).toBeUndefined();
  });

  it("插件引用保留自定义类型外观，并由实体入口打开", async () => {
    metadata.mockResolvedValue({
      kind: "plugin-entity",
      id: 12,
      pluginId: "test",
      entityKind: "note",
      contentId: 100,
      contentCreatedAt: 2,
      createdAt: 1,
      title: "最新周记",
      label: "周记",
      icon: '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0h10v10z"/></svg>',
    });
    getContentDetail.mockResolvedValue({
      contentId: 100,
      createTime: 2,
      updateTime: 10,
      content: [],
      count: 3,
    });
    await renderSheet(vi.fn(), { ...target, contentType: "plugin-entity" });
    await vi.waitFor(() => expect(findButton("打开周记")).toBeDefined());
    expect(document.body.textContent).toContain("最新周记");
    await act(async () => findButton("打开周记")?.click());
    expect(pluginOpen).toHaveBeenCalledWith(12, {
      expectedContentId: 100,
      expectedCreatedAt: undefined,
    });
  });

  afterEach(async () => {
    await act(async () => root?.unmount());
    root = null;
    document.body.innerHTML = "";
  });

  it("载入后显示类型、字数与标签，「打开」先关面板再跳到卡片", async () => {
    getContentDetail.mockResolvedValue({
      contentId: 100,
      createTime: 0,
      updateTime: Date.now(),
      content: [{ type: "paragraph", children: [{ type: "formatted", text: "正文" }] }],
      count: 860,
      card: { tags: ["记忆"] },
    });
    const calls: string[] = [];
    push.mockImplementation(() => calls.push("push"));
    await renderSheet(vi.fn(reason => calls.push(`close:${reason}`)));

    const text = document.body.textContent ?? "";
    expect(getContentDetail).toHaveBeenCalledWith(100);
    expect(text).toContain("艾宾浩斯遗忘曲线");
    expect(text).toContain("卡片 · 更新于");
    expect(text).toContain("约 860 字");
    expect(text).toContain("记忆");
    expect(document.querySelector('[data-testid="preview-editor"]')).toBeTruthy();

    await act(async () => findButton("打开卡片")?.click());
    expect(calls).toEqual(["close:open", "push"]);
    expect(push).toHaveBeenCalledWith("contentDetail", { cardId: 12 });
  });

  it("内容已删除：显示引用已失效，不提供打开", async () => {
    getContentDetail.mockRejectedValue("CONTENT_NOT_FOUND: content does not exist");
    await renderSheet();

    expect(document.body.textContent).toContain("引用已失效");
    expect(findButton("打开")).toBeUndefined();
  });

  it("协作者视角：提示未共享，不查询本机库", async () => {
    collaboration.value = { mode: "shared", role: "editor" };
    await renderSheet();

    expect(document.body.textContent).toContain("内容未共享");
    expect(getContentDetail).not.toHaveBeenCalled();
    expect(findButton("打开")).toBeUndefined();
  });
});
