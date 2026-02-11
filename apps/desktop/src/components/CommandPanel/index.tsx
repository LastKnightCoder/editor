import { memo, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import CommandPalette, {
  filterItems,
  getItemIndex,
} from "@tmikeladze/react-cmdk";
import { useMemoizedFn } from "ahooks";

import useTabStore from "@/stores/useTabStore";
import useNavigationHistoryStore from "@/stores/useNavigationHistoryStore";
import useSettingStore from "@/stores/useSettingStore";
import { TabType, TAB_TITLES } from "@/types/tab";

import "@tmikeladze/react-cmdk/dist/cmdk.css";
import "./index.module.less";
import useTheme from "@/hooks/useTheme";

// 所有可导航的页面
const ALL_PAGES = [
  { type: TabType.Home, category: "通用" },
  { type: TabType.CardList, category: "内容", module: "card" },
  { type: TabType.ArticleList, category: "内容", module: "article" },
  { type: TabType.ProjectList, category: "内容", module: "project" },
  { type: TabType.DocumentList, category: "内容", module: "document" },
  { type: TabType.WhiteBoardList, category: "内容", module: "whiteBoard" },
  { type: TabType.PdfList, category: "内容", module: "pdf" },
  { type: TabType.DailyNote, category: "内容", module: "dailyNote" },
  { type: TabType.WeRead, category: "内容", module: "weread" },
  { type: TabType.VecDocument, category: "工具", module: "vecDocuments" },
  { type: TabType.Calendar, category: "工具" },
  { type: TabType.ChatManagement, category: "工具" },
  {
    type: TabType.ResourceManagement,
    category: "工具",
    module: "resourceManagement",
  },
  {
    type: TabType.PromptManagement,
    category: "工具",
    module: "promptManagement",
  },
  { type: TabType.DataView, category: "工具", module: "dataView" },
  { type: TabType.Todo, category: "效率", module: "todo" },
  { type: TabType.Questions, category: "效率", module: "question" },
  { type: TabType.Pomodoro, category: "效率", module: "pomodoro" },
  { type: TabType.Settings, category: "设置" },
];

const CommandPanel = memo(() => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const { theme } = useTheme();

  const navigateTo = useTabStore((state) => state.navigateTo);
  const addToHistory = useNavigationHistoryStore((state) => state.addToHistory);
  const getRecentItems = useNavigationHistoryStore(
    (state) => state.getRecentItems,
  );
  const getFrequentItems = useNavigationHistoryStore(
    (state) => state.getFrequentItems,
  );
  const moduleSetting = useSettingStore((state) => state.setting.module);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "p" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const handleSelect = useMemoizedFn((type: TabType) => {
    const title = TAB_TITLES[type];
    addToHistory(type, undefined, title);
    navigateTo(type, undefined, title);
    setOpen(false);
    setSearch("");
  });

  // 过滤启用的页面
  const enabledPages = ALL_PAGES.filter((page) => {
    if (!page.module) return true;
    const moduleKey = page.module as keyof typeof moduleSetting;
    return moduleSetting[moduleKey]?.enable !== false;
  });

  // 按分类分组
  const pagesByCategory = enabledPages.reduce(
    (acc, page) => {
      if (!acc[page.category]) {
        acc[page.category] = [];
      }
      acc[page.category].push(page);
      return acc;
    },
    {} as Record<string, typeof enabledPages>,
  );

  const recentItems = getRecentItems(5);
  const frequentItems = getFrequentItems(5);

  const filteredItems = filterItems(
    [
      ...(!search && recentItems.length > 0
        ? [
            {
              heading: "最近访问",
              id: "recent",
              items: recentItems.map((item) => ({
                id: `recent-${item.type}`,
                children: `🕐 ${item.title || TAB_TITLES[item.type]}`,
                onClick: () => handleSelect(item.type),
              })),
            },
          ]
        : []),
      ...(!search && frequentItems.length > 0
        ? [
            {
              heading: "常用",
              id: "frequent",
              items: frequentItems.map((item) => ({
                id: `frequent-${item.type}`,
                children: `⭐ ${item.title || TAB_TITLES[item.type]} (${item.count})`,
                onClick: () => handleSelect(item.type),
              })),
            },
          ]
        : []),
      ...Object.entries(pagesByCategory).map(([category, pages]) => ({
        heading: category,
        id: category,
        items: pages.map((page) => ({
          id: page.type,
          children: TAB_TITLES[page.type],
          onClick: () => handleSelect(page.type),
        })),
      })),
    ],
    search,
  );

  return createPortal(
    <CommandPalette
      commandPaletteContentClassName={theme}
      onChangeSearch={setSearch}
      onChangeOpen={setOpen}
      search={search}
      isOpen={open}
      page="root"
    >
      <CommandPalette.Page id="root">
        {filteredItems.length > 0 ? (
          filteredItems.map((list) => (
            <CommandPalette.List key={list.id} heading={list.heading}>
              {list.items.map(({ id, ...rest }) => (
                <CommandPalette.ListItem
                  key={id}
                  index={getItemIndex(filteredItems, id)}
                  {...rest}
                />
              ))}
            </CommandPalette.List>
          ))
        ) : (
          <CommandPalette.FreeSearchAction />
        )}
      </CommandPalette.Page>
    </CommandPalette>,
    document.body,
  );
});

export default CommandPanel;
