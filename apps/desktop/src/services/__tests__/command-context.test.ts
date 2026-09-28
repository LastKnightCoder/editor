import { beforeEach, expect, it, vi } from "vitest";

beforeEach(() => vi.resetModules());

it("真实命令封装在 await 与并发调用间保持各自的数据库身份", async () => {
  const calls: unknown[][] = [];
  let resume!: () => void;
  const waiting = new Promise<void>(resolve => {
    resume = resolve;
  });
  window.electron = {
    platform: "darwin",
    invoke: async (...args: unknown[]) => {
      calls.push(args);
      if (args[0] === "calendar:get-all") await waiting;
      return [];
    },
  } as unknown as ElectronAPI;
  const { bindDatabaseCommands } = await import("../command-context");
  const commands = await import("@/commands/calendar");
  const a = bindDatabaseCommands(commands, { databaseName: "a" });
  const b = bindDatabaseCommands(commands, { databaseName: "b" });
  const workA = (async () => {
    await a.getAllCalendars();
    await a.deleteCalendarEvent(17);
  })();
  await b.deleteCalendarEvent(17);
  resume();
  await workA;
  expect(calls).toEqual([
    ["calendar:get-all", { toolDatabaseName: "a" }],
    ["calendar-event:delete", 17, { toolDatabaseName: "b" }],
    ["calendar-event:delete", 17, { toolDatabaseName: "a" }],
  ]);
});

it("等待 IPC 时中止，拒绝返回并阻止后续写入", async () => {
  let resume!: () => void;
  const waiting = new Promise<void>(resolve => {
    resume = resolve;
  });
  const invoke = vi.fn(async () => {
    await waiting;
    return [];
  });
  window.electron = { platform: "darwin", invoke } as unknown as ElectronAPI;
  const { bindDatabaseCommands } = await import("../command-context");
  const commands = await import("@/commands/calendar");
  const controller = new AbortController();
  const scoped = bindDatabaseCommands(commands, { databaseName: "a", signal: controller.signal });
  const run = (async () => {
    await scoped.getAllCalendars();
    await scoped.deleteCalendarEvent(17);
  })();
  controller.abort();
  resume();
  await expect(run).rejects.toThrow();
  expect(invoke).toHaveBeenCalledOnce();
});
