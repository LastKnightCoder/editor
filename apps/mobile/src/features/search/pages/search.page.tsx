// 搜索页：查询条件/结果/加载态全部页面私有（keep-alive 跨进出保留），
// 搜索请求自包含（原先 isSearching/请求序号提升在 AppShell）。

import { useMemoizedFn } from "ahooks";
import { useRef, useState } from "react";
import { SearchPage } from "../SearchPage";
import { useAppContext } from "../../../app/AppContext";
import * as tauri from "../../../services/tauri";
import { definePage, useNavigator } from "../../../router";
import type { CardsOverviewResponse } from "../../../types";

const EMPTY_SEARCH_RESULT: CardsOverviewResponse = {
  total: 0,
  page: 1,
  pageSize: 20,
  query: "",
  category: "",
  searchMode: "none",
  items: [],
};

function SearchScreen() {
  const navigator = useNavigator();
  const app = useAppContext();
  const [isSearching, setIsSearching] = useState(false);
  const requestSeqRef = useRef(0);

  const handleSearch = useMemoizedFn(async (query: string) => {
    const requestSeq = ++requestSeqRef.current;
    setIsSearching(true);
    try {
      return await tauri.getCardsOverview({
        page: 1,
        pageSize: app.cards.queryState.pageSize || 20,
        query,
        category: app.cards.queryState.category,
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

  return (
    <SearchPage
      onClose={() => navigator.goBack("ui")}
      onSearch={handleSearch}
      onPreviewCard={cardId => navigator.push("contentDetail", { cardId })}
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
