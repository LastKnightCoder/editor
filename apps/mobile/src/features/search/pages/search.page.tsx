// 搜索页：查询条件/结果/加载态全部页面私有（keep-alive 跨进出保留），
// 搜索请求自包含（原先 isSearching/请求序号提升在 AppShell）。

import { useMemoizedFn } from "ahooks";
import { useRef, useState } from "react";
import { SearchPage } from "../SearchPage";
import { useAppContext } from "../../../app/AppContext";
import * as tauri from "../../../services/tauri";
import { definePage, useNavigator } from "../../../router";
import type { UnifiedSearchResponse, UnifiedSearchResult } from "../../../types";
import { openMobilePluginEntity } from "../../../services/pluginEntities";

const EMPTY_SEARCH_RESULT: UnifiedSearchResponse = {
  total: 0,
  page: 1,
  pageSize: 20,
  query: "",
  searchMode: "none",
  items: [],
};

function SearchScreen() {
  const navigator = useNavigator();
  const app = useAppContext();
  const [isSearching, setIsSearching] = useState(false);
  const requestSeqRef = useRef(0);

  const handleSearch = useMemoizedFn(async (query: string, page = 1) => {
    const requestSeq = ++requestSeqRef.current;
    setIsSearching(true);
    try {
      return await tauri.searchAllContent({
        page,
        pageSize: 20,
        query,
      });
    } catch (error) {
      app.presentError(error, "搜索失败");
      return EMPTY_SEARCH_RESULT;
    } finally {
      if (requestSeqRef.current === requestSeq) {
        setIsSearching(false);
      }
    }
  });

  const openResult = (result: UnifiedSearchResult) => {
    switch (result.type) {
      case "plugin-entity":
        void openMobilePluginEntity(result.id, {
          expectedContentId: result.contentId ?? undefined,
          expectedCreatedAt: result.pluginEntity?.createdAt,
        }).catch(error => app.presentError(error, "插件内容打开失败"));
        break;
      case "card":
        navigator.push("contentDetail", { cardId: result.id });
        break;
      case "article":
        navigator.push("articleEditor", { articleId: result.id });
        break;
      case "project-item":
        navigator.push("projectDocEditor", {
          itemId: result.id,
          projectTitle: result.containerTitle ?? "",
        });
        break;
      case "flashcard":
        navigator.push("flashcardCardEdit", { deckId: -1, cardId: result.id });
        break;
      case "diary-daily":
        if (result.contentId) {
          navigator.push("contentDetail", {
            contentId: result.contentId,
            fromDiary: true,
            diaryDate: {
              title: result.date ?? result.title,
              sub: result.containerTitle ?? undefined,
            },
          });
        } else {
          navigator.push("diaryHome", {});
        }
        break;
      default:
        break;
    }
  };

  return (
    <SearchPage
      onClose={() => navigator.goBack("ui")}
      onSearch={handleSearch}
      onOpenResult={openResult}
      isSearching={isSearching}
    />
  );
}

export default definePage({
  key: "search",
  match: "single",
  transition: { preset: "sheetUp" },
  params: {},
  component: SearchScreen,
});
