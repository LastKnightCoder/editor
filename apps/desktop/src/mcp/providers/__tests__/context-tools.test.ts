import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/commands/extra", () => ({
  getVersions: vi.fn(async () => ({
    app: "1.2.3",
    node: "v20.0.0",
    v8: "11.0",
    chrome: "116.0",
    electron: "27.0",
  })),
}));

vi.mock("@/services/page-navigation", () => ({
  getPageNavigation: vi.fn(),
}));

vi.mock("@/page/core/pageMeta", () => ({
  getPageMeta: vi.fn(() => ({ label: "文章" })),
}));

vi.mock("@/services/content-editing", () => ({
  getActiveEditingSession: vi.fn(),
  buildInlineEditorContextFromSnapshot: vi.fn(() => ({
    selectedMarkdown: "选中的文本",
    currentBlockMarkdown: "光标所在块",
    selectionBefore: "前文",
    selectionAfter: "后文",
    documentLength: 100,
  })),
}));

import { contextToolsProvider } from "../context-tools";
import { getPageNavigation } from "@/services/page-navigation";
import { getActiveEditingSession } from "@/services/content-editing";
import { registerAppContextProvider, unregisterAppContextProvider } from "@/services/app-context";
import { createPluginPageContext } from "@/services/plugin-page-context";

const getTool = (name: string) => {
  const tool = contextToolsProvider.tools().find(item => item.name === name);
  if (!tool) throw new Error(`tool ${name} not found`);
  return tool;
};

const runTool = async (name: string) => {
  const result = await getTool(name).executor({});
  return JSON.parse((result as { content: string }).content);
};

describe("context tools provider", () => {
  afterEach(() => {
    vi.clearAllMocks();
    unregisterAppContextProvider("test-detail");
  });

  it("现有工具原样返回当前插件页的 JSON，忽略隐藏实例并隔离提供器异常", async () => {
    const params = { pluginId: "sample", pageId: "detail", instanceId: "A", params: "{}" };
    const scope = createPluginPageContext({
      params,
      signal: new AbortController().signal,
      isAvailable: () => true,
    });
    const unmount = scope.mount();
    try {
      const registration = scope.pageContext.register(() => ["任意形状", { customId: 9 }]);
      const state = {
        back: [{ id: "1", key: "plugin-page", params, createdAt: 0, lastActiveAt: 0 }],
        forward: [],
      };
      vi.mocked(getPageNavigation).mockReturnValue({ navigator: {}, state } as never);
      vi.mocked(getActiveEditingSession).mockReturnValue(null);
      expect((await runTool("get_current_context")).page.pluginContext).toEqual([
        "任意形状",
        { customId: 9 },
      ]);
      state.back[0] = { ...state.back[0], params: { ...params, instanceId: "B" } };
      expect((await runTool("get_current_context")).page.pluginContext).toBeNull();
      state.back[0] = { ...state.back[0], params };
      registration.dispose();
      scope.pageContext.register(() => {
        throw new Error("插件失败");
      });
      const result = await runTool("get_current_context");
      expect(result.page).toMatchObject({ key: "plugin-page", pluginContext: null });
      expect(result.details).toEqual([]);
    } finally {
      unmount();
    }
  });

  it("get_current_context 聚合页面 / 编辑器 / 详情三层", async () => {
    vi.mocked(getPageNavigation).mockReturnValue({
      navigator: {} as never,
      state: {
        back: [{ id: "1", key: "article", params: { id: 42 }, createdAt: 0, lastActiveAt: 0 }],
        forward: [],
      },
    } as never);
    vi.mocked(getActiveEditingSession).mockReturnValue({
      contentId: 107,
      entityType: "article",
      entityId: 42,
      focused: true,
      selection: {
        anchor: { path: [0], offset: 0 },
        focus: { path: [0], offset: 3 },
        isCollapsed: false,
      },
    } as never);
    registerAppContextProvider("test-detail", {
      label: "待办详情",
      provide: () => ({ id: 9, title: "买牛奶" }),
    });

    const data = await runTool("get_current_context");

    expect(data.page).toEqual({ key: "article", label: "文章", params: { id: 42 } });
    expect(data.editor).toMatchObject({
      contentId: 107,
      entityType: "article",
      hasSelection: true,
      selectedMarkdown: "选中的文本",
      currentBlockMarkdown: "光标所在块",
    });
    expect(data.details).toEqual([
      { key: "test-detail", label: "待办详情", data: { id: 9, title: "买牛奶" } },
    ]);
  });

  it("导航未绑定时 page 为 null，其余上下文不受影响", async () => {
    vi.mocked(getPageNavigation).mockImplementation(() => {
      throw new Error("主窗口页面尚未就绪");
    });
    vi.mocked(getActiveEditingSession).mockReturnValue(null);

    const data = await runTool("get_current_context");

    expect(data.page).toBeNull();
    expect(data.editor).toBeNull();
    expect(data.details).toEqual([]);
  });

  it("详情 provider 抛错或返回 null 时被省略，不影响聚合", async () => {
    vi.mocked(getPageNavigation).mockReturnValue({
      navigator: {} as never,
      state: { back: [], forward: [] },
    } as never);
    vi.mocked(getActiveEditingSession).mockReturnValue(null);
    registerAppContextProvider("test-detail", {
      label: "坏掉的详情",
      provide: () => {
        throw new Error("boom");
      },
    });

    const data = await runTool("get_current_context");

    expect(data.details).toEqual([]);
  });

  it("get_app_info 返回版本与运行环境", async () => {
    const info = await runTool("get_app_info");

    expect(info).toMatchObject({
      appVersion: "1.2.3",
      runtime: { node: "v20.0.0", electron: "27.0", chrome: "116.0" },
    });
    expect(typeof info.platform).toBe("string");
    expect(typeof info.language).toBe("string");
  });
});
