import { afterEach, expect, it } from "vitest";
import { ECardCategory } from "@/types/card";
import { useCardsPreferencesStore } from "../preferences";

afterEach(() => {
  useCardsPreferencesStore.setState({ byDatabase: {} });
  useCardsPreferencesStore.persist.clearStorage();
});

it("重建状态后恢复视图和分类，两个数据库互不覆盖", async () => {
  const { update } = useCardsPreferencesStore.getState();
  update("a", { view: "database", category: ECardCategory.Literature });
  update("b", { view: "database", category: "all" });
  const persisted = localStorage.getItem("tau-cards-preferences")!;
  useCardsPreferencesStore.setState({ byDatabase: {} });
  localStorage.setItem("tau-cards-preferences", persisted);
  await useCardsPreferencesStore.persist.rehydrate();
  expect(useCardsPreferencesStore.getState().byDatabase).toEqual({
    a: { view: "database", category: ECardCategory.Literature },
    b: { view: "database", category: "all" },
  });
});

it("旧版本持久化数据迁移时丢弃标签与标签树收起状态", async () => {
  localStorage.setItem(
    "tau-cards-preferences",
    JSON.stringify({
      state: {
        byDatabase: {
          a: { view: "wall", category: ECardCategory.Permanent, tag: "读书", treeCollapsed: true },
        },
      },
      version: 0,
    })
  );
  await useCardsPreferencesStore.persist.rehydrate();
  expect(useCardsPreferencesStore.getState().byDatabase).toEqual({
    a: { view: "wall", category: ECardCategory.Permanent },
  });
});
