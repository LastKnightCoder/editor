import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import useArticleDeletedCleanup from "../useArticleDeletedCleanup";
import useTabStore from "@/stores/useTabStore";
import useSettingStore from "@/stores/useSettingStore";
import { closeArticleWindow } from "@/commands/article";
import { defaultArticleEventBus } from "@/utils/event-bus/article-event-bus";
import { TabType } from "@/types/tab";
import type { IPane, ITab } from "@/types/tab";
import type { IArticle } from "@/types";

vi.mock("@/commands/article", async importOriginal => ({
  ...(await importOriginal<typeof import("@/commands/article")>()),
  closeArticleWindow: vi.fn().mockResolvedValue(undefined),
}));

const HookHarness = () => {
  useArticleDeletedCleanup();
  return null;
};

const createPane = (id: string, tabs: ITab[], activeTabId: string): IPane => ({
  id,
  tabs,
  activeTabId,
  groups: [],
});

const createArticleDetailTab = (tabId: string, articleId: number): ITab =>
  ({
    id: tabId,
    type: TabType.ArticleDetail,
    title: `文章 - ${articleId}`,
    params: { id: articleId },
    closable: true,
  }) as ITab;

const createHomeTab = (tabId: string): ITab =>
  ({
    id: tabId,
    type: TabType.Home,
    title: "首页",
    closable: true,
  }) as ITab;

const publishArticleDeleted = (articleId: number) => {
  defaultArticleEventBus.publish("article:deleted", {
    article: { id: articleId } as IArticle,
    sourceUuid: "test",
  });
};

describe("useArticleDeletedCleanup", () => {
  const initialPanes = structuredClone(useTabStore.getState().panes);
  const initialActivePaneId = useTabStore.getState().activePaneId;
  const initialDatabaseName = useSettingStore.getState().setting.database.active;

  let root: Root | null = null;
  let container: HTMLDivElement | null = null;

  beforeEach(async () => {
    useSettingStore.setState(state => ({
      ...state,
      setting: {
        ...state.setting,
        database: { ...state.setting.database, active: "test.db" },
      },
    }));

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<HookHarness />);
    });
  });

  afterEach(async () => {
    if (root && container) {
      await act(async () => {
        root?.unmount();
      });
      container.remove();
    }
    root = null;
    container = null;

    useTabStore.setState({
      panes: structuredClone(initialPanes),
      activePaneId: initialActivePaneId,
    });
    useSettingStore.setState(state => ({
      ...state,
      setting: {
        ...state.setting,
        database: { ...state.setting.database, active: initialDatabaseName },
      },
    }));
    vi.mocked(closeArticleWindow).mockClear();
  });

  it("删除文章后关闭当前 pane 中对应的文章详情 Tab", async () => {
    useTabStore.setState({
      panes: [
        createPane(
          "pane-1",
          [createArticleDetailTab("tab-a1", 1), createArticleDetailTab("tab-a2", 2)],
          "tab-a1"
        ),
      ],
      activePaneId: "pane-1",
    });

    await act(async () => {
      publishArticleDeleted(1);
    });

    const pane = useTabStore.getState().panes[0];
    expect(pane.tabs.map(tab => tab.id)).toEqual(["tab-a2"]);
    // 关闭的是激活 Tab，应切换到相邻 Tab
    expect(pane.activeTabId).toBe("tab-a2");
  });

  it("删除文章后关闭所有 pane 中对应的文章详情 Tab，并清理空 pane", async () => {
    useTabStore.setState({
      panes: [
        createPane(
          "pane-1",
          [createHomeTab("tab-home"), createArticleDetailTab("tab-a1", 1)],
          "tab-a1"
        ),
        createPane("pane-2", [createArticleDetailTab("tab-b1", 1)], "tab-b1"),
      ],
      activePaneId: "pane-2",
    });

    await act(async () => {
      publishArticleDeleted(1);
    });

    const { panes } = useTabStore.getState();
    // pane-2 中唯一的 Tab 被关闭后，pane-2 应被移除
    expect(panes.map(pane => pane.id)).toEqual(["pane-1"]);
    expect(panes[0].tabs.map(tab => tab.id)).toEqual(["tab-home"]);
    expect(panes[0].activeTabId).toBe("tab-home");
  });

  it("不影响其他文章的 Tab", async () => {
    useTabStore.setState({
      panes: [
        createPane(
          "pane-1",
          [createArticleDetailTab("tab-a2", 2), createHomeTab("tab-home")],
          "tab-a2"
        ),
      ],
      activePaneId: "pane-1",
    });

    await act(async () => {
      publishArticleDeleted(1);
    });

    const pane = useTabStore.getState().panes[0];
    expect(pane.tabs.map(tab => tab.id)).toEqual(["tab-a2", "tab-home"]);
    expect(pane.activeTabId).toBe("tab-a2");
  });

  it("删除文章后请求主进程关闭该文章的独立窗口", async () => {
    await act(async () => {
      publishArticleDeleted(1);
    });

    expect(closeArticleWindow).toHaveBeenCalledWith("test.db", 1);
  });
});
