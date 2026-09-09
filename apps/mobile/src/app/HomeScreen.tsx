// 根页内容：Header + 卡片列表 + 悬浮工具栏。
// 由 PageHost 以 rootContent 渲染：非根时经 Activity hidden 隔离（无惯性滚动/交互）。

import { Header } from "../components/Header";
import { FloatingToolbar } from "../components/FloatingToolbar";
import { CardsPage } from "../features/cards/CardsPage";
import { useTodoStore } from "../features/todo/store/useTodoStore";
import { useRootScrollLock } from "../router/useRootScrollLock";
import { useRouterContext } from "../router";
import { useAppContext } from "./AppContext";

export function HomeScreen() {
  const app = useAppContext();
  const { state, navigator } = useRouterContext();
  const topKey = state.screens.entries[state.screens.entries.length - 1]?.key;
  useRootScrollLock(topKey !== "home");

  return (
    <div>
      <Header title="卡片" />
      <div className="px-4 pt-4">
        <CardsPage
          cards={app.cards.cards}
          queryState={app.cards.queryState}
          totalPages={app.cards.totalPages}
          isLoadingCards={app.cards.isLoadingCards}
          isPreviewOpen={state.overlays.entries.some(e => e.key === "cardPreview")}
          onPreviewCard={cardId => navigator.push("cardPreview", { cardId })}
          onUpdateCardCategory={app.handleUpdateCardCategory}
          onDeleteCard={app.handleDeleteCard}
          setQueryState={app.cards.setQueryState}
          refreshCards={app.refreshCardsSafe}
        />
      </div>
      <FloatingToolbar
        onSearchClick={() => navigator.push("search")}
        onAddClick={() => navigator.push("quickCapture")}
        onDiaryClick={() => navigator.push("diaryHome")}
        showDiaryEntry={app.diaryModuleEnabled}
        onTodoClick={() => {
          const databaseName =
            app.syncSettings.safeSetting?.database?.active ??
            app.bootstrap.databases?.activeDatabase ??
            null;
          void useTodoStore.getState().initialize(databaseName);
          navigator.push("todo");
        }}
        showTodoEntry={app.todoModuleEnabled}
        onSettingsClick={() => navigator.push("settings")}
      />
    </div>
  );
}
