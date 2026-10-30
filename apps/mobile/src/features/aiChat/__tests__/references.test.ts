// 回答引用：按类型把实体 id 换成预览目标；日记按日给出时取当天第一段，不提供跳转。

import { beforeEach, expect, it, vi } from "vitest";

const tauri = vi.hoisted(() => ({ aiSqlQuery: vi.fn() }));
vi.mock("../../../services/tauri", () => tauri);

import { resolveChatReference } from "../references";

beforeEach(() => tauri.aiSqlQuery.mockReset());

it("卡片：查出 contentId，保留跳转用的实体 id", async () => {
  tauri.aiSqlQuery.mockResolvedValue({ rows: [{ contentId: 31, title: "" }] });
  await expect(resolveChatReference("data.db", 7, "card", "间隔重复")).resolves.toEqual({
    contentId: 31,
    contentType: "card",
    contentTitle: "间隔重复",
    refId: 7,
  });
  expect(tauri.aiSqlQuery.mock.calls[0][1].params).toEqual({ id: 7 });
});

it("按日的日记：取当天第一段预览，标题用日期，不给打开", async () => {
  tauri.aiSqlQuery.mockResolvedValue({ rows: [{ contentId: 88, title: "2026-10-29" }] });
  const target = await resolveChatReference("data.db", 5, "diary-daily", "10 月 29 日");
  expect(target).toEqual({
    contentId: 88,
    contentType: "diary-moment",
    contentTitle: "2026-10-29",
    refId: -1,
  });
  expect(tauri.aiSqlQuery.mock.calls[0][1].sql).toContain("diary_entries");
});

it("不认识的类型或已删除的实体返回 null", async () => {
  await expect(resolveChatReference("data.db", 1, "question", "x")).resolves.toBeNull();
  expect(tauri.aiSqlQuery).not.toHaveBeenCalled();
  tauri.aiSqlQuery.mockResolvedValue({ rows: [] });
  await expect(resolveChatReference("data.db", 9, "article", "x")).resolves.toBeNull();
});
