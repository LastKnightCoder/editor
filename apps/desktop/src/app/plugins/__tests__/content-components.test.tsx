import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ContentEditor,
  ContentPreview,
  type PluginContext,
  type PluginPermissionState,
} from "@tau/plugins";

const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  locate: vi.fn(),
  openPage: vi.fn(),
  editor: vi.fn(),
  preview: vi.fn(),
}));
vi.mock("@/commands/plugin-data", () => ({ readPluginContent: mocks.read }));
vi.mock("@/commands/entity", () => ({ locateEntity: mocks.locate }));
vi.mock("@/services/page-navigation", () => ({ openPage: mocks.openPage }));
vi.mock("@/services/editorKit", () => ({ getContentKit: () => ({}) }));
vi.mock("@/components/ContentEditor", () => ({
  default: (props: Record<string, unknown>) => {
    mocks.editor(props);
    return <div data-testid="editor" />;
  },
}));
vi.mock("@tau/editor", () => ({
  Editor: (props: { initValue?: unknown[] }) => {
    mocks.preview(props.initValue);
    return <div data-testid="preview" />;
  },
}));

import { PluginComponentScope } from "../content-components";

const nodes = [1, 2, 3, 4, 5].map(index => ({
  type: "paragraph",
  children: [{ text: `第 ${index} 段` }],
}));

function pluginContext(states: Record<string, PluginPermissionState>) {
  const request = vi.fn(async (permissions: string[]) => {
    for (const permission of permissions) states[permission] = "granted";
    return true;
  });
  const context = {
    pluginId: "tau.weekly-review",
    signal: new AbortController().signal,
    permissions: {
      query: vi.fn(async (permission: string) => states[permission] ?? "denied"),
      request,
    },
  } as unknown as PluginContext;
  return { context, request };
}

let root: Root;
let container: HTMLDivElement;
function render(element: React.ReactNode, context?: PluginContext) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  act(() =>
    root.render(
      <QueryClientProvider client={client}>
        {context ? (
          <PluginComponentScope context={context}>{element}</PluginComponentScope>
        ) : (
          element
        )}
      </QueryClientProvider>
    )
  );
}
async function settle() {
  for (let index = 0; index < 10; index++) await act(() => new Promise(r => setTimeout(r, 0)));
}

describe("插件正文组件", () => {
  // 视图按需加载，预热后懒组件在一次提交内就绪
  beforeAll(() => import("../content-components-view"), 30_000);
  beforeEach(() => {
    Object.values(mocks).forEach(mock => mock.mockReset());
    mocks.read.mockResolvedValue({
      contentId: 8,
      createdAt: 100,
      updatedAt: 200,
      revision: "u:200",
      wordCount: 10,
      nodes,
      owners: ["card"],
      pluginOwners: [],
      databaseName: "data.db",
    });
    mocks.locate.mockResolvedValue({ kind: "card", id: 3 });
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("已获准写入时渲染宿主编辑器，并补全协作来源与编辑身份", async () => {
    const { context } = pluginContext({ "cards:write": "granted" });
    render(<ContentEditor contentRef="8:100" placeholder="写点什么" />, context);
    await settle();
    expect(mocks.read.mock.calls[0].slice(1)).toEqual([8, 100, "nodes"]);
    expect(mocks.locate.mock.calls[0][0]).toMatchObject({ contentId: 8, kind: "card" });
    expect(mocks.editor).toHaveBeenLastCalledWith(
      expect.objectContaining({
        contentId: 8,
        source: { sourceType: "card", sourceId: 3 },
        editingContext: { entityType: "card", entityId: 3 },
        readonly: false,
        placeHolder: "写点什么",
      })
    );
  });

  it("只读按读取权限放行，不登记编辑身份", async () => {
    const { context } = pluginContext({ "cards:read": "granted" });
    render(<ContentEditor contentRef="8:100" readonly />, context);
    await settle();
    const props = mocks.editor.mock.lastCall?.[0];
    expect(props).toMatchObject({ readonly: true });
    expect(props).not.toHaveProperty("editingContext");
  });

  it("未决定时不自动弹窗，用户点「允许访问」才询问", async () => {
    const { context, request } = pluginContext({ "cards:write": "prompt" });
    render(<ContentEditor contentRef="8:100" />, context);
    await settle();
    expect(request).not.toHaveBeenCalled();
    expect(mocks.editor).not.toHaveBeenCalled();
    const button = [...container.querySelectorAll("button")].find(
      item => item.textContent === "允许访问"
    );
    expect(container.textContent).toContain("插件需要你的允许才能编辑这段内容");
    await act(async () => button!.click());
    await settle();
    expect(request).toHaveBeenCalledWith(["cards:write"]);
    expect(mocks.editor).toHaveBeenCalled();
  });

  it("已拒绝时提示到插件详情页修改", async () => {
    const { context } = pluginContext({ "cards:read": "denied" });
    render(<ContentPreview contentRef="8:100" />, context);
    await settle();
    expect(container.textContent).toContain("插件没有获准查看这段内容");
    const button = [...container.querySelectorAll("button")].find(
      item => item.textContent === "查看权限"
    );
    await act(async () => button!.click());
    expect(mocks.openPage).toHaveBeenCalledWith("plugin-detail", {
      pluginId: "tau.weekly-review",
      tab: "permissions",
    });
  });

  it("预览只渲染开头几块", async () => {
    const { context } = pluginContext({ "cards:read": "granted" });
    render(<ContentPreview contentRef="8:100" maxBlocks={2} />, context);
    await settle();
    expect(mocks.preview).toHaveBeenLastCalledWith(nodes.slice(0, 2));
  });

  it("插件自己的内容不询问权限，按通用正文协作、不登记编辑身份", async () => {
    const { context } = pluginContext({});
    mocks.read.mockResolvedValue({
      contentId: 9,
      createdAt: 100,
      nodes,
      owners: [],
      pluginOwners: [{ pluginId: "tau.weekly-review", id: 4, title: "第 43 周" }],
    });
    render(<ContentEditor contentRef="9:100" />, context);
    await settle();
    expect(context.permissions.query).not.toHaveBeenCalled();
    expect(mocks.locate).not.toHaveBeenCalled();
    const props = mocks.editor.mock.lastCall?.[0];
    expect(props).toMatchObject({ contentId: 9, source: { sourceType: "content", sourceId: 9 } });
    expect(props).not.toHaveProperty("editingContext");
  });

  it("其他插件的内容不算自有内容", async () => {
    const { context } = pluginContext({});
    mocks.read.mockResolvedValue({
      contentId: 9,
      createdAt: 100,
      nodes,
      owners: [],
      pluginOwners: [{ pluginId: "tau.other", id: 4, title: "别人的" }],
    });
    render(<ContentPreview contentRef="9:100" />, context);
    await settle();
    expect(container.textContent).toContain("内容不存在或已删除");
  });

  it("正文不存在、引用无效或不在插件页面内时给出说明", async () => {
    const { context } = pluginContext({ "cards:read": "granted" });
    mocks.read.mockResolvedValue(null);
    render(<ContentPreview contentRef="8:100" />, context);
    await settle();
    expect(container.textContent).toContain("内容不存在或已删除");

    render(<ContentPreview contentRef="not-a-ref" />, context);
    await settle();
    expect(container.textContent).toContain("内容不存在或已删除");

    render(<ContentPreview contentRef="8:100" />);
    await settle();
    expect(container.textContent).toContain("正文组件只能在插件页面中使用");
  });
});
