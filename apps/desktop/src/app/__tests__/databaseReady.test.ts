import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.mock("@/commands", () => ({ connectDatabaseByName: vi.fn() }));
vi.mock("@/stores/useSettingStore", async () => {
  const { create } = await import("zustand");
  return {
    default: create(() => ({ inited: true, setting: { database: { active: "new.db" } } })),
  };
});
vi.mock("@/stores/useGlobalStateStore", async () => {
  const { create } = await import("zustand");
  return { default: create(() => ({ databaseStatus: {} })) };
});

import { connectDatabaseByName } from "@/commands";
import { queryClient } from "@/queryClient";
import useSettingStore from "@/stores/useSettingStore";
import { ensureDatabaseReady } from "../databaseReady";

beforeEach(() => {
  vi.mocked(connectDatabaseByName).mockReset().mockResolvedValue(undefined);
  useSettingStore.setState(state => ({
    setting: { ...state.setting, database: { ...state.setting.database, active: "new.db" } },
  }));
});
afterEach(() => queryClient.clear());

it("切库连接成功后丢弃旧库的新鲜空缓存，首页和项目重新查询", async () => {
  const keys = [
    ["home", "snapshot"],
    ["projects", "list"],
  ];
  for (const key of keys) queryClient.setQueryData(key, []);
  expect(await ensureDatabaseReady()).toBe(true);
  for (const key of keys) {
    const fetch = vi.fn(async () => ["新库数据"]);
    expect(
      await queryClient.fetchQuery({ queryKey: key, queryFn: fetch, staleTime: Infinity })
    ).toEqual(["新库数据"]);
    expect(fetch).toHaveBeenCalledOnce();
  }
});

it("切库前的在途查询迟到不会覆盖新库缓存", async () => {
  const key = ["home", "snapshot"];
  let finish!: (value: string[]) => void;
  const oldRequest = queryClient
    .fetchQuery({
      queryKey: key,
      queryFn: () =>
        new Promise<string[]>(resolve => {
          finish = resolve;
        }),
    })
    .catch(() => undefined);
  expect(await ensureDatabaseReady()).toBe(true);
  const fresh = vi.fn(async () => ["新库数据"]);
  const newRequest = queryClient.fetchQuery({ queryKey: key, queryFn: fresh });
  finish(["旧库数据"]);
  await oldRequest;
  expect(await newRequest).toEqual(["新库数据"]);
  expect(queryClient.getQueryData(key)).toEqual(["新库数据"]);
});

it("已经过期的连接结果不能清除当前库缓存", async () => {
  let finish!: () => void;
  vi.mocked(connectDatabaseByName).mockReturnValueOnce(
    new Promise<void>(resolve => {
      finish = resolve;
    })
  );
  const connecting = ensureDatabaseReady();
  useSettingStore.setState(state => ({
    setting: { ...state.setting, database: { ...state.setting.database, active: "current.db" } },
  }));
  queryClient.setQueryData(["home", "snapshot"], ["当前库数据"]);
  finish();
  expect(await connecting).toBe(false);
  expect(queryClient.getQueryData(["home", "snapshot"])).toEqual(["当前库数据"]);
});
