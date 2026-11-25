import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";

vi.mock("@/stores/useSettingStore", async () => {
  const { create } = await import("zustand");
  return { default: create(() => ({ setting: { database: { active: "a.db" } } })) };
});
vi.mock("@/hooks/useDatabaseConnected", () => ({ default: () => true }));

const invoke = vi.fn();
const listeners = new Map<string, (...args: unknown[]) => void>();
const pending: Array<() => void> = [];
const heldChannels = new Set<string>();
let connections: typeof import("../command-context");
let schedule: typeof import("@/features/schedule/queries");
let flashcards: typeof import("@/features/flashcards/queries");
let quizzes: typeof import("@/features/vibe-learning/quizQueries");
let client: QueryClient;
let root: Root;
let host: HTMLDivElement;
let revision: string;
let rejected: number;
let accepted: number;
const probes = new Map<
  number,
  {
    commands: ReturnType<typeof schedule.useScheduleCommands>["commands"];
    schedule: ReturnType<typeof schedule.useScheduleMutations>;
    flashcards: ReturnType<typeof flashcards.useFlashcardMutations>;
    quizzes: ReturnType<typeof quizzes.useQuizMutations>;
  }
>();

beforeAll(async () => {
  window.electron = {
    platform: "darwin",
    invoke,
    on: (channel: string, listener: (...args: unknown[]) => void) =>
      listeners.set(channel, listener),
  } as unknown as ElectronAPI;
  connections = await import("../command-context");
  await import("@/commands/database");
  schedule = await import("@/features/schedule/queries");
  flashcards = await import("@/features/flashcards/queries");
  quizzes = await import("@/features/vibe-learning/quizQueries");
});

beforeEach(() => {
  revision = "before";
  rejected = 0;
  accepted = 0;
  pending.length = 0;
  heldChannels.clear();
  probes.clear();
  connections.rememberDatabaseConnection({ databaseName: "a.db", connectionId: revision });
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  invoke.mockReset();
  invoke.mockImplementation(async (channel: string, ...args: unknown[]) => {
    const scope = args.at(-1) as { toolDatabaseConnection?: string };
    if (scope.toolDatabaseConnection !== revision) {
      rejected++;
      throw new Error("DATABASE_CONNECTION_CHANGED");
    }
    accepted++;
    let result: unknown = [];
    if (channel === "calendar:get-all") result = [{ id: 1, title: revision, visible: true }];
    if (channel === "calendar-event:get-by-date-range") result = [{ id: 1, title: revision }];
    if (channel === "flashcard:list-decks") result = [{ id: 1, name: revision }];
    if (channel === "flashcard:list-cards") result = [{ id: 1, tags: [revision] }];
    if (channel === "vl-quiz:list-sets") result = [{ id: 1, name: revision }];
    if (
      channel === "calendar:update" ||
      channel === "flashcard:update-card" ||
      channel === "vl-quiz:update-set"
    )
      result = args[0];
    if (heldChannels.has(channel))
      return new Promise(resolve => pending.push(() => resolve(result)));
    return result;
  });
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  client.clear();
});

function Probe({ id = 7 }: { id?: number }) {
  const catalog = schedule.useCalendarCatalog();
  const events = schedule.useCalendarEvents();
  const snapshot = flashcards.useFlashcardSnapshot();
  const sets = quizzes.useQuizSets(id);
  probes.set(id, {
    commands: schedule.useScheduleCommands().commands,
    schedule: schedule.useScheduleMutations(),
    flashcards: flashcards.useFlashcardMutations(),
    quizzes: quizzes.useQuizMutations(),
  });
  return (
    <output>
      {catalog.calendars[0]?.title}/{events.events[0]?.title}/{snapshot.snapshot?.decks[0]?.name}/
      {sets.sets[0]?.name}
    </output>
  );
}

async function mount(count = 1) {
  await act(async () =>
    root.render(
      <QueryClientProvider client={client}>
        {Array.from({ length: count }, (_, index) => (
          <Probe key={index} id={index + 7} />
        ))}
      </QueryClientProvider>
    )
  );
}

async function waitForRevision(value: string, count = 1) {
  await act(async () => {
    await vi.waitFor(() => {
      const outputs = [...host.querySelectorAll("output")];
      expect(outputs).toHaveLength(count);
      for (const output of outputs)
        expect(output.textContent).toBe(`${value}/${value}/${value}/${value}`);
    });
  });
}

function probe(id: number) {
  const value = probes.get(id);
  if (!value) throw new Error(`页面 ${id} 尚未挂载`);
  return value;
}

async function replace(next: string, broadcast = false) {
  await act(async () => {
    revision = next;
    const connection = { databaseName: "a.db", connectionId: revision };
    if (broadcast) {
      const listener = listeners.get("database:sync-reconnected");
      if (!listener) throw new Error("缺少重连监听");
      listener(null, connection);
    } else connections.rememberDatabaseConnection(connection);
    await client.invalidateQueries({
      predicate: query => connections.isCurrentDatabaseQuery(query.queryKey),
    });
  });
}

it("下载覆盖同名资料库后，已挂载的日程、闪卡和测验自动读取新连接", async () => {
  await mount();
  await waitForRevision("before");
  await replace("after");
  await waitForRevision("after");
  expect(rejected).toBe(0);
});

it("其他窗口的覆盖广播更新对应库，不切换本窗口活动连接；重复通知不重复加载", async () => {
  await mount();
  await waitForRevision("before");
  connections.rememberDatabaseConnection({ databaseName: "b.db", connectionId: "other-window" });
  await replace("after", true);
  await waitForRevision("after");
  expect(connections.currentCommandScope()).toEqual({
    databaseName: "b.db",
    connectionId: "other-window",
  });
  const previous = connections.getDatabaseConnection("a");
  const calls = accepted;
  await act(async () => listeners.get("database:sync-reconnected")?.(null, previous));
  expect(connections.getDatabaseConnection("a.db")).toBe(previous);
  expect(accepted).toBe(calls);
  expect(rejected).toBe(0);
});

it("覆盖前尚未返回的读取，不覆盖新连接的列表或事件", async () => {
  heldChannels.add("calendar:get-all");
  heldChannels.add("flashcard:list-decks");
  heldChannels.add("vl-quiz:list-sets");
  await mount();
  expect(pending).toHaveLength(3);
  heldChannels.clear();
  await replace("after", true);
  await waitForRevision("after");
  await act(async () =>
    pending
      .splice(0)
      .reverse()
      .forEach(resolve => resolve())
  );
  await waitForRevision("after");
  expect(rejected).toBe(0);
});

it("旧连接的迟到写入响应只回写旧缓存；已捕获的旧命令不能操作新库", async () => {
  await mount();
  await waitForRevision("before");
  const previous = probe(7);
  for (const channel of ["calendar:update", "flashcard:update-card", "vl-quiz:update-set"])
    heldChannels.add(channel);
  const writes = [
    previous.schedule.toggleCalendarVisibility(1),
    previous.flashcards.updateCard({ id: 1, tags: ["stale"] }),
    previous.quizzes.updateQuizSet({ id: 1, name: "stale" }),
  ];
  await vi.waitFor(() => expect(pending).toHaveLength(3));
  heldChannels.clear();
  await replace("after");
  await waitForRevision("after");
  await act(async () => {
    pending
      .splice(0)
      .reverse()
      .forEach(resolve => resolve());
    await Promise.all(writes);
  });
  expect(client.getQueryData(schedule.scheduleKeys.catalog("a.db", "after"))).toMatchObject({
    calendars: [{ title: "after", visible: true }],
  });
  expect(client.getQueryData(flashcards.flashcardKeys.snapshot("a.db", "after"))).toMatchObject({
    cards: [{ tags: ["after"] }],
  });
  expect(client.getQueryData(quizzes.quizKeys.sets("a.db", 7, "after"))).toMatchObject([
    { name: "after" },
  ]);
  await expect(previous.schedule.deleteEvent(1)).rejects.toThrow("DATABASE_CONNECTION_CHANGED");
  await expect(previous.flashcards.deleteCard(1)).rejects.toThrow("DATABASE_CONNECTION_CHANGED");
  await expect(previous.quizzes.deleteQuizSet(1)).rejects.toThrow("DATABASE_CONNECTION_CHANGED");
  expect(rejected).toBe(3);
});

it.skipIf(process.env.TAU_DATABASE_RECONNECT_STRESS !== "1")(
  "连续覆盖、并发读取和保留页面不复用旧连接",
  async () => {
    const rounds = 200;
    const readers = 16;
    await mount(readers);
    await waitForRevision("before", readers);
    for (let round = 0; round < rounds; round++) {
      const previous = probe(7).commands;
      await replace(`revision-${round}`, true);
      await waitForRevision(revision, readers);
      await Promise.all(
        Array.from({ length: readers * 8 }, (_, index) =>
          probe(7 + (index % readers)).commands.getAllCalendars()
        )
      );
      await expect(previous.getAllCalendars()).rejects.toThrow("DATABASE_CONNECTION_CHANGED");
    }
    expect(rejected).toBe(rounds);
    expect(accepted).toBeGreaterThanOrEqual(rounds * readers * 8);
    console.info(
      `[database-reconnect stress] rounds=${rounds}, retainedViews=${readers}, accepted=${accepted}, staleRejected=${rejected}`
    );
  },
  120_000
);
