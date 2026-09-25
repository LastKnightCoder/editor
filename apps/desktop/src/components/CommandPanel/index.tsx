import { memo, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import CommandPalette, { filterItems, getItemIndex } from "@tmikeladze/react-cmdk";
import { useMemoizedFn } from "ahooks";

import useTabStore from "@/stores/useTabStore";
import useNavigationHistoryStore from "@/stores/useNavigationHistoryStore";
import { TabType, TAB_TITLES } from "@/types/tab";

import "@tmikeladze/react-cmdk/dist/cmdk.css";
import "./index.module.less";
import useTheme from "@/hooks/useTheme";

// 所有可导航的页面
const ALL_PAGES = [
  { type: TabType.Home, category: "通用" },
  { type: TabType.CardList, category: "内容" },
  { type: TabType.ArticleList, category: "内容" },
  { type: TabType.ProjectList, category: "内容" },
  { type: TabType.WhiteBoardList, category: "内容" },
  { type: TabType.PdfList, category: "内容" },
  { type: TabType.DailyNote, category: "内容" },
  { type: TabType.WeRead, category: "内容" },
  { type: TabType.Collaboration, category: "工具" },
  { type: TabType.VecDocument, category: "工具" },
  { type: TabType.Calendar, category: "工具" },
  { type: TabType.ChatManagement, category: "工具" },
  { type: TabType.Todo, category: "效率" },
  { type: TabType.Questions, category: "效率" },
  { type: TabType.Pomodoro, category: "效率" },
  { type: TabType.Settings, category: "设置" },
];

const CommandPanel = memo(() => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const { theme } = useTheme();

  const navigateTo = useTabStore(state => state.navigateTo);
  const addToHistory = useNavigationHistoryStore(state => state.addToHistory);
  const getRecentItems = useNavigationHistoryStore(state => state.getRecentItems);
  const getFrequentItems = useNavigationHistoryStore(state => state.getFrequentItems);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "p" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        setOpen(prev => !prev);
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

  // 按分类分组
  const pagesByCategory = ALL_PAGES.reduce(
    (acc, page) => {
      if (!acc[page.category]) {
        acc[page.category] = [];
      }
      acc[page.category].push(page);
      return acc;
    },
    {} as Record<string, typeof ALL_PAGES>
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
              items: recentItems.map(item => ({
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
              items: frequentItems.map(item => ({
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
        items: pages.map(page => ({
          id: page.type,
          children: TAB_TITLES[page.type],
          onClick: () => handleSelect(page.type),
        })),
      })),
    ],
    search
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
          filteredItems.map(list => (
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
    document.body
  );
});

export default CommandPanel;
