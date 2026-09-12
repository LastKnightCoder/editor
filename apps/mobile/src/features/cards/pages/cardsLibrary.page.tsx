// 卡片库页：数据经 AppContext 的全局卡片查询（与首页共享缓存），
// 点卡片直接进详情页（contentDetail 的 cardId 入口），更新类型/删除在详情页 ⋯ 菜单。

import { useMemoizedFn } from "ahooks";
import { CardsLibraryPage } from "../CardsLibraryPage";
import { useAppContext } from "../../../app/AppContext";
import { definePage, useNavigator } from "../../../router";

function CardsLibraryScreen() {
  const navigator = useNavigator();
  const app = useAppContext();

  const onOpenCard = useMemoizedFn((cardId: number) => {
    navigator.push("contentDetail", { cardId });
  });

  return (
    <CardsLibraryPage
      onOpenSearch={() => navigator.push("search")}
      onPreviewCard={onOpenCard}
      isPreviewOpen={false}
      cards={app.cards.cards}
      queryState={app.cards.queryState}
      totalPages={app.cards.totalPages}
      isLoadingCards={app.cards.isLoadingCards}
      setQueryState={app.cards.setQueryState}
      refreshCards={app.refreshCardsSafe}
    />
  );
}

export default definePage({
  key: "cardsLibrary",
  match: "single",
  params: {},
  component: CardsLibraryScreen,
});
