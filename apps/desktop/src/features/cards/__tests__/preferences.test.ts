import { afterEach, expect, it } from "vitest";
import { ECardCategory } from "@/types/card";
import { useCardsPreferencesStore } from "../preferences";

afterEach(() => {
  useCardsPreferencesStore.setState({ byDatabase: {} });
  useCardsPreferencesStore.persist.clearStorage();
});

it("重建状态后恢复视图、分类和标签，两个数据库互不覆盖", async () => {
  const { update } = useCardsPreferencesStore.getState();
  update("a", { view: "graph", category: ECardCategory.Literature, tag: "读书/历史" });
  update("b", { view: "database", category: "all", tag: "工作" });
  const persisted = localStorage.getItem("tau-cards-preferences")!;
  useCardsPreferencesStore.setState({ byDatabase: {} });
  localStorage.setItem("tau-cards-preferences", persisted);
  await useCardsPreferencesStore.persist.rehydrate();
  expect(useCardsPreferencesStore.getState().byDatabase).toEqual({
    a: {
      view: "graph",
      category: ECardCategory.Literature,
      tag: "读书/历史",
      treeCollapsed: false,
    },
    b: { view: "database", category: "all", tag: "工作", treeCollapsed: false },
  });
});
