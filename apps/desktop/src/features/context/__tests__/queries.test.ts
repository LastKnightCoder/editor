import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (event: unknown, payload: unknown) => void>(),
}));

vi.mock("@/electron", async importOriginal => ({
  ...(await importOriginal<typeof import("@/electron")>()),
  on: (channel: string, handler: (event: unknown, payload: unknown) => void) =>
    mocks.handlers.set(channel, handler),
  invoke: vi.fn(),
}));

vi.mock("@/queryClient", async () => {
  const { QueryClient: Client } = await import("@tanstack/react-query");
  return { queryClient: new Client() };
});

import { queryClient } from "@/queryClient";
import { entityContextKeys, invalidateEntityContext } from "../queries";

describe("脉络查询的缓存键与失效", () => {
  it("按库名分组，库名去掉 .db 后缀", () => {
    expect(entityContextKeys.entity("main.db", { kind: "card", id: 3 })).toEqual([
      "entity-context",
      "main",
      "card",
      3,
    ]);
  });

  it("只失效对应库的脉络", async () => {
    const client = new QueryClient();
    client.setQueryData(entityContextKeys.entity("a.db", { kind: "card", id: 1 }), 1);
    client.setQueryData(entityContextKeys.entity("b.db", { kind: "card", id: 1 }), 1);
    await invalidateEntityContext(client, "a.db");
    expect(
      client.getQueryState(entityContextKeys.entity("a.db", { kind: "card", id: 1 }))?.isInvalidated
    ).toBe(true);
    expect(
      client.getQueryState(entityContextKeys.entity("b.db", { kind: "card", id: 1 }))?.isInvalidated
    ).toBe(false);
  });

  it("收到主进程 entity-context:changed 时失效该库", () => {
    const spy = vi.spyOn(queryClient, "invalidateQueries");
    mocks.handlers.get("entity-context:changed")?.({}, { databaseName: "main.db" });
    expect(spy).toHaveBeenCalledWith({ queryKey: ["entity-context", "main"] });
    // 删实体释放边只广播 entity-context:changed，连接列表（表格列）连带失效
    expect(spy).toHaveBeenCalledWith({ queryKey: ["content-links", "main"] });
  });

  it("收到主进程 content-links:changed 时失效该库连接列表", () => {
    const spy = vi.spyOn(queryClient, "invalidateQueries");
    mocks.handlers.get("content-links:changed")?.({}, { databaseName: "main.db" });
    expect(spy).toHaveBeenCalledWith({ queryKey: ["content-links", "main"] });
  });
});
