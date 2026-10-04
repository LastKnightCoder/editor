import { afterEach, expect, it } from "vitest";
import { useCardsPreferencesStore } from "../preferences";

afterEach(() => {
  useCardsPreferencesStore.setState({ byDatabase: {} });
  useCardsPreferencesStore.persist.clearStorage();
});

it("重建状态后恢复视图，两个数据库互不覆盖", async () => {
  const { update } = useCardsPreferencesStore.getState();
  update("a", { view: "database" });
  update("b", { view: "wall" });
  const persisted = localStorage.getItem("tau-cards-preferences")!;
  useCardsPreferencesStore.setState({ byDatabase: {} });
  localStorage.setItem("tau-cards-preferences", persisted);
  await useCardsPreferencesStore.persist.rehydrate();
  expect(useCardsPreferencesStore.getState().byDatabase).toEqual({
    a: { view: "database" },
    b: { view: "wall" },
  });
});

it("旧版本持久化数据迁移时丢弃标签与分类筛选，「图谱」回落到卡片墙", async () => {
  localStorage.setItem(
    "tau-cards-preferences",
    JSON.stringify({
      state: {
        byDatabase: {
          a: { view: "wall", category: "permanent", tag: "读书", treeCollapsed: true },
          b: { view: "graph" },
        },
      },
      version: 0,
    })
  );
  await useCardsPreferencesStore.persist.rehydrate();
  expect(useCardsPreferencesStore.getState().byDatabase).toEqual({
    a: { view: "wall" },
    b: { view: "wall" },
  });
});
