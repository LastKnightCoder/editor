import { getPageNavigation } from "@/services/page-navigation";
import { getPageMeta } from "@/page/core/pageMeta";
import { tabContentRegistry } from "./registry";
import type { TabContentResponse, PaneContentResponse, TabContentOptions } from "./types";
import { TabType, type ITab } from "@/types/tab";

const PANEL_ID = "page-stack";

// 仅复用内容序列化器，页面身份和激活状态始终来自 Page 栈。
const CONTENT_PROVIDERS: Record<string, TabType> = {
  home: TabType.Home,
  cards: TabType.CardList,
  "card-detail": TabType.CardDetail,
  articles: TabType.ArticleList,
  "article-detail": TabType.ArticleDetail,
  projects: TabType.ProjectList,
  "project-detail": TabType.ProjectDetail,
  webview: TabType.WebView,
  "whiteboard-content": TabType.WhiteBoardDetail,
};

export function getCurrentPanels(): PaneContentResponse[] {
  const { state } = getPageNavigation();
  const active = state.back.at(-1);
  return [
    {
      paneId: PANEL_ID,
      activeTabId: active?.id ?? "",
      tabCount: state.back.length,
      tabs: state.back.map(entry => ({
        id: entry.id,
        type: entry.key,
        title: getPageMeta(entry.key)?.label ?? entry.key,
        isActive: entry.id === active?.id,
        hasParams: Object.keys(entry.params).length > 0,
      })),
    },
  ];
}

export function getPaneTabs(paneId: string): PaneContentResponse | null {
  return paneId === PANEL_ID ? getCurrentPanels()[0] : null;
}

export function getActiveTab() {
  const entry = getPageNavigation().state.back.at(-1);
  if (!entry) return null;
  return {
    paneId: PANEL_ID,
    tab: {
      id: entry.id,
      type: entry.key,
      title: getPageMeta(entry.key)?.label ?? entry.key,
      params: entry.params,
    },
    isActive: true as const,
  };
}

export async function getTabContent(
  tabId: string,
  options?: TabContentOptions
): Promise<TabContentResponse | null> {
  const { state } = getPageNavigation();
  const entry = state.back.find(page => page.id === tabId);
  if (!entry) return null;
  const metadata = {
    id: entry.id,
    type: entry.key,
    title: getPageMeta(entry.key)?.label ?? entry.key,
    params: entry.params,
    paneId: PANEL_ID,
    isActive: state.back.at(-1)?.id === entry.id,
  };
  const type = CONTENT_PROVIDERS[entry.key];
  const provider = type ? tabContentRegistry.getProvider(type) : null;
  if (!provider) {
    return {
      metadata,
      contentType: "object",
      content: {
        pageKey: entry.key,
        params: entry.params,
        description: "此页面尚未提供内容读取能力",
      },
    };
  }
  const params =
    entry.key === "whiteboard-content"
      ? { type: "content", whiteBoardContentId: entry.params.id }
      : entry.params;
  const content = await provider.getContent(
    {
      id: entry.id,
      type,
      title: metadata.title,
      params: params as ITab["params"],
    },
    options
  );
  return { ...content, metadata: { ...content.metadata, ...metadata } };
}

export async function getActiveTabContent(
  options?: TabContentOptions
): Promise<TabContentResponse | null> {
  const active = getActiveTab();
  return active ? getTabContent(active.tab.id, options) : null;
}
