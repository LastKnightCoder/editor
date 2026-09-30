import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { VLQuizSet } from "@/types";

vi.mock("@/stores/useSettingStore", async () => {
  const { create } = await import("zustand");
  return { default: create(() => ({ setting: { database: { active: "a" } } })) };
});
vi.mock("@/hooks/useDatabaseConnected", () => ({ default: () => true }));

const invoke = vi.fn();
const listeners = new Map<string, (...args: unknown[]) => void>();
let api: typeof import("../quizQueries");
let settings: typeof import("@/stores/useSettingStore").default;
let sharedClient: QueryClient;
let client: QueryClient;
let root: Root | undefined;
let host: HTMLDivElement;
let mutations: ReturnType<typeof import("../quizQueries").useQuizMutations>;

const quiz = (name: string, projectId = 7): VLQuizSet => ({
  id: 1,
  projectId,
  name,
  description: "",
  emoji: "",
  resourceIds: [],
  prompt: null,
  itemCount: 1,
  createTime: 0,
  updateTime: 0,
});
const switchDatabase = (active: string) =>
  settings.setState(state => ({
    setting: {
      ...state.setting,
      database: { ...state.setting.database, active },
    },
  }));

beforeAll(async () => {
  window.electron = {
    platform: "darwin",
    invoke,
    on: (channel: string, handler: (...args: unknown[]) => void) => listeners.set(channel, handler),
  } as unknown as ElectronAPI;
  api = await import("../quizQueries");
  settings = (await import("@/stores/useSettingStore")).default;
  sharedClient = (await import("@/queryClient")).queryClient;
});
beforeEach(() => {
  switchDatabase("a");
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  invoke.mockReset();
  invoke.mockImplementation(async (channel: string, ...args: unknown[]) => {
    const scope = args.at(-1) as { toolDatabaseName?: string };
    if (!scope.toolDatabaseName) throw new Error("未指定数据库");
    if (channel === "vl-quiz:list-sets")
      return [quiz(`${scope.toolDatabaseName}-${args[0]}`, Number(args[0]))];
    if (channel === "vl-quiz:best-scores") return { 1: 80 };
    if (channel === "vl-quiz:list-items" || channel === "vl-quiz:list-records") return [];
    return quiz("已更新");
  });
});
afterEach(() => {
  if (root) act(() => root?.unmount());
  root = undefined;
  host?.remove();
  client.clear();
  sharedClient.clear();
});
async function mount(component: React.ReactNode) {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () =>
    root?.render(<QueryClientProvider client={client}>{component}</QueryClientProvider>)
  );
}
async function waitFor(check: () => void) {
  await act(async () => {
    await vi.waitFor(check);
  });
}
function SetsProbe({ projectId }: { projectId: number }) {
  const { sets } = api.useQuizSets(projectId);
  return <output>{sets.map(set => set.name).join(",")}</output>;
}
function MutationProbe() {
  mutations = api.useQuizMutations();
  return null;
}
function SummaryProbe() {
  const { sets } = api.useQuizSets(7);
  const { scores } = api.useQuizBestScores(7);
  api.useQuizRecords(undefined, false);
  return (
    <output>
      {sets.length}:{scores[1]}
    </output>
  );
}

describe("测验数据库数据隔离", () => {
  it("同库不同项目独立查询，切库迟到结果不覆盖新库", async () => {
    let finish!: (rows: VLQuizSet[]) => void;
    invoke.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          finish = resolve;
        })
    );
    await mount(
      <>
        <SetsProbe projectId={7} />
        <SetsProbe projectId={8} />
      </>
    );
    await waitFor(() => expect(host.textContent).toContain("a-8"));
    await act(async () => switchDatabase("b"));
    await waitFor(() => expect(host.textContent).toBe("b-7b-8"));
    await act(async () => finish([quiz("a-late")]));
    expect(host.textContent).toBe("b-7b-8");
    expect(client.getQueryData(api.quizKeys.sets("a", 7))).toMatchObject([{ name: "a-late" }]);
    expect(invoke).toHaveBeenCalledWith("vl-quiz:list-sets", 7, { toolDatabaseName: "b" });
  });

  it("最高分只读聚合，记录浮层关闭时不拉全部历史", async () => {
    await mount(<SummaryProbe />);
    await waitFor(() => expect(host.textContent).toBe("1:80"));
    expect(invoke).toHaveBeenCalledWith("vl-quiz:best-scores", 7, { toolDatabaseName: "a" });
    expect(invoke.mock.calls.some(call => call[0] === "vl-quiz:list-records")).toBe(false);
  });

  it("在途更新只回写原库，旧操作切库后拒绝再写", async () => {
    await mount(<MutationProbe />);
    client.setQueryData(api.quizKeys.sets("a", 7), [quiz("a")]);
    client.setQueryData(api.quizKeys.sets("b", 7), [quiz("b")]);
    const previous = mutations;
    let finish!: (value: VLQuizSet) => void;
    invoke.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          finish = resolve;
        })
    );
    const saving = previous.updateQuizSet({ id: 1, name: "a-update" });
    await act(async () => switchDatabase("b"));
    await act(async () => {
      finish(quiz("a-update"));
      await saving;
    });
    expect(client.getQueryData(api.quizKeys.sets("a", 7))).toMatchObject([{ name: "a-update" }]);
    expect(client.getQueryData(api.quizKeys.sets("b", 7))).toMatchObject([{ name: "b" }]);
    const calls = invoke.mock.calls.length;
    await expect(previous.deleteQuizSet(1)).rejects.toThrow("数据库已切换");
    expect(invoke).toHaveBeenCalledTimes(calls);
  });

  it("被删除对象与写入失败不会成为成功操作，也不发布缓存失效", async () => {
    await mount(<MutationProbe />);
    client.setQueryData(api.quizKeys.sets("a", 7), [quiz("a")]);
    invoke.mockResolvedValueOnce(null);
    await expect(mutations.updateQuizSet({ id: 1, name: "失效" })).rejects.toThrow(
      "测验集已不存在"
    );
    invoke.mockResolvedValueOnce(null);
    await expect(mutations.updateItem({ id: 1 })).rejects.toThrow("测验题已不存在");
    invoke.mockResolvedValueOnce(false);
    await expect(mutations.deleteItem(1)).rejects.toThrow("测验题已不存在");
    invoke.mockRejectedValueOnce(new Error("写入失败"));
    await expect(
      mutations.createRecord({
        projectId: 7,
        quizSetId: 1,
        score: 0,
        totalCount: 1,
        correctCount: 0,
        answers: [],
        duration: 0,
      })
    ).rejects.toThrow("写入失败");
    expect(client.getQueryState(api.quizKeys.sets("a", 7))?.isInvalidated).toBe(false);
    expect(client.getQueryData(api.quizKeys.sets("a", 7))).toMatchObject([{ name: "a" }]);
  });

  it("原库通知只失效原库查询", () => {
    sharedClient.setQueryData(api.quizKeys.sets("a", 7), [quiz("a")]);
    sharedClient.setQueryData(api.quizKeys.sets("b", 7), [quiz("b")]);
    const listener = listeners.get("vl-quiz:changed");
    if (!listener) throw new Error("测验通知未注册");
    listener(null, { databaseName: "a.db" });
    expect(sharedClient.getQueryState(api.quizKeys.sets("a", 7))?.isInvalidated).toBe(true);
    expect(sharedClient.getQueryState(api.quizKeys.sets("b", 7))?.isInvalidated).toBe(false);
  });
});
