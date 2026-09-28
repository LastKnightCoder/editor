/**
 * 「整体重算知识地图」写回缓存的形状。曾经写进一份裸地图（缓存里应是带 status 的 payload），
 * 图谱读 `.map` 读到 undefined、退回了链接图谱：点完重算，分布与缩放全变了，重进页面才恢复。
 */

import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getKnowledgeMap: vi.fn() }));
vi.mock("@/commands/knowledge-map", () => ({ getKnowledgeMap: mocks.getKnowledgeMap }));
vi.mock("@/stores/useSettingStore", () => ({
  default: { getState: () => ({ setting: { database: { active: "data.db" } } }) },
}));

import { knowledgeMapKey } from "@/features/cards/queries";
import { queryClient } from "@/queryClient";
import { registerBuiltinDevActions } from "../actions";
import { listDevActions } from "../registry";

beforeEach(() => {
  queryClient.clear();
  mocks.getKnowledgeMap.mockReset();
});

it("整体重算后缓存里是完整的 payload（带 status），图谱仍能读到地图", async () => {
  const map = { nodes: [], topics: [], computedAt: 1 };
  mocks.getKnowledgeMap.mockResolvedValue({ status: "ready", map });
  registerBuiltinDevActions();
  const action = listDevActions().find(item => item.id === "knowledge-map:rebuild")!;
  await action.run();
  const cached = queryClient.getQueryData<{ status: string; map: unknown }>(
    knowledgeMapKey("data.db")
  );
  expect(cached).toEqual({ status: "ready", map });
  expect(cached?.map).toBe(map);
});
