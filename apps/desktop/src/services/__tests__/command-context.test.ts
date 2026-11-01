import { beforeEach, expect, it, vi } from "vitest";

beforeEach(() => vi.resetModules());

it("生产构建的冻结命令模块仍能绑定数据库且不修改原模块", async () => {
  const invoke = vi.fn(async () => []);
  window.electron = { platform: "darwin", invoke } as unknown as ElectronAPI;
  const { bindDatabaseCommands, currentCommandScope } = await import("../command-context");
  const flashcardCommands = await import("@/commands/flashcard");
  const commands = Object.freeze({ ...flashcardCommands });
  const scoped = bindDatabaseCommands(commands, { databaseName: "a" });

  await scoped.listFlashcardDecks();
  await scoped.listFlashcards({});
  await commands.listFlashcardDecks();

  expect(invoke.mock.calls).toEqual([
    ["flashcard:list-decks", { toolDatabaseName: "a" }],
    ["flashcard:list-cards", {}, { toolDatabaseName: "a" }],
    ["flashcard:list-decks"],
  ]);
  expect(commands.listFlashcardDecks).toBe(flashcardCommands.listFlashcardDecks);
  expect(Object.isFrozen(commands)).toBe(true);
  expect(currentCommandScope()).toBeUndefined();
});

it("冻结命令嵌套调用和同步失败后恢复外层上下文", async () => {
  const { bindDatabaseCommands, currentCommandScope } = await import("../command-context");
  const failure = new Error("命令失败");
  const inner = bindDatabaseCommands(
    Object.freeze({
      fail() {
        expect(currentCommandScope()?.databaseName).toBe("b");
        throw failure;
      },
    }),
    { databaseName: "b" }
  );
  const commands = Object.freeze({
    label: "命令模块",
    run() {
      expect(this).toBe(commands);
      expect(() => inner.fail()).toThrow(failure);
      expect(currentCommandScope()?.databaseName).toBe("a");
      return this.label;
    },
  });
  const scoped = bindDatabaseCommands(commands, { databaseName: "a" });
  expect(scoped.run()).toBe("命令模块");
  expect(scoped.label).toBe(commands.label);
  expect(currentCommandScope()).toBeUndefined();
});

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

it("旧命令与异步准备在重新连接后仍携带原连接，不能领取新连接", async () => {
  const invoke = vi.fn(async () => []);
  window.electron = { platform: "darwin", invoke } as unknown as ElectronAPI;
  const { bindDatabaseCommands, currentCommandScope, rememberDatabaseConnection } =
    await import("../command-context");
  const commands = await import("@/commands/calendar");
  rememberDatabaseConnection({ databaseName: "a.db", connectionId: "before" });
  const captured = currentCommandScope();
  const request = { databaseName: "a" };
  const old = bindDatabaseCommands(commands, request);
  rememberDatabaseConnection({ databaseName: "b.db", connectionId: "other" });
  rememberDatabaseConnection({ databaseName: "a.db", connectionId: "after" });

  await old.deleteCalendarEvent(17);
  await bindDatabaseCommands(commands, captured).deleteCalendarEvent(18);
  await bindDatabaseCommands(commands, { databaseName: "a" }).deleteCalendarEvent(19);
  await bindDatabaseCommands(commands, request).deleteCalendarEvent(20);
  expect(invoke.mock.calls).toEqual([
    ["calendar-event:delete", 17, { toolDatabaseName: "a", toolDatabaseConnection: "before" }],
    ["calendar-event:delete", 18, { toolDatabaseName: "a.db", toolDatabaseConnection: "before" }],
    ["calendar-event:delete", 19, { toolDatabaseName: "a", toolDatabaseConnection: "after" }],
    ["calendar-event:delete", 20, { toolDatabaseName: "a", toolDatabaseConnection: "before" }],
  ]);
});

it("迟到的旧连接响应不能覆盖当前窗口的命令上下文", async () => {
  let finish!: (value: unknown) => void;
  window.electron = {
    invoke: async (_channel: string, name: string) =>
      name === "a"
        ? new Promise(resolve => {
            finish = resolve;
          })
        : { databaseName: name, connectionId: "current" },
  } as unknown as ElectronAPI;
  const { connectDatabaseByName } = await import("@/commands/database");
  const { currentCommandScope } = await import("../command-context");
  const previous = connectDatabaseByName("a");
  await connectDatabaseByName("b");
  finish({ databaseName: "a", connectionId: "old" });
  await previous;
  expect(currentCommandScope()).toEqual({ databaseName: "b", connectionId: "current" });
});
