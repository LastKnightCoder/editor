import { desktopLocaleSource } from "@/app/i18n/runtime";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { searchCatalog } from "@/commands/entity";
import { searchHybridContent } from "@/commands/fts";
import useSettingStore from "@/stores/useSettingStore";
import { useSearchContent } from "../queries";
import type { PaletteSearchType } from "../searchMeta";
import type { SearchResult } from "@/types";
import type { CatalogSearchResult } from "@/types/search";
import { taskAssistantRequest } from "@/commands/task-assistant";

vi.mock("@/commands/entity", () => ({ searchCatalog: vi.fn() }));
vi.mock("@/commands/task-assistant", () => ({ taskAssistantRequest: vi.fn() }));
vi.mock("@/commands/fts", () => ({ searchHybridContent: vi.fn() }));
vi.mock("@/utils/embedding-model-info", () => ({
  resolveEmbeddingModelInfoFromSetting: () => undefined,
}));

const task: CatalogSearchResult = {
  type: "todo",
  id: 17,
  title: "2026年度复盘",

  snippet: "",
  meta: "工作",
  updateTime: 1,
};
const article: SearchResult = {
  type: "article",
  id: 8,
  title: "年度计划",
  contentId: 80,
  content: [],
  updateTime: 1,
  source: "fts",
};
let root: Root;
let container: HTMLDivElement;
let client: QueryClient;
let current: ReturnType<typeof useSearchContent>;
const originalSetting = useSettingStore.getState().setting;

function Harness({ query, types }: { query: string; types?: PaletteSearchType[] }) {
  current = useSearchContent(query, types);
  return null;
}

async function render(query = "2026年", types?: PaletteSearchType[]) {
  await act(async () =>
    root.render(
      <QueryClientProvider client={client}>
        <Harness query={query} types={types} />
      </QueryClientProvider>
    )
  );
}

async function settle() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1);
  });
  expect(current.isFetching).toBe(false);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(taskAssistantRequest).mockReset().mockResolvedValue({ items: [], warnings: [] });
  vi.mocked(searchCatalog).mockReset().mockResolvedValue([task]);
  vi.mocked(searchHybridContent).mockReset().mockResolvedValue([article]);
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  container = document.createElement("div");
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
  vi.useRealTimers();
  useSettingStore.setState({ setting: originalSetting });
});

it("全文索引没有待办时，全部搜索仍返回标题匹配的待办和正文结果", async () => {
  await render();
  await settle();
  expect(current.data).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ type: "todo", id: 17 }),
      expect.objectContaining({ type: "article", id: 8 }),
    ])
  );
  expect(searchCatalog).toHaveBeenCalledWith(expect.objectContaining({ keyword: "2026年" }));
});

it("只搜待办时不依赖全文索引，也不把待办类型发给全文检索", async () => {
  vi.mocked(searchHybridContent).mockRejectedValue(new Error("索引不可用"));
  await render("2026年", ["todo"]);
  await settle();
  expect(current.data?.map(result => result.id)).toEqual([17]);
  expect(searchHybridContent).not.toHaveBeenCalled();
  expect(searchCatalog).toHaveBeenCalledWith(expect.objectContaining({ types: ["todo"] }));
});

it("查询失败保留错误状态，不伪装成没有搜索结果", async () => {
  const error = new Error("数据库暂不可用");
  vi.mocked(searchCatalog).mockRejectedValue(error);
  await render("2026年", ["todo"]);
  await settle();
  expect(current.error?.message).toContain(error.message);
  expect(current.isError).toBe(true);
});

it("正文索引失败时仍展示名称结果，并明确报告哪一路未完成", async () => {
  vi.mocked(searchHybridContent).mockRejectedValue(new Error("索引暂不可用"));
  await render();
  await settle();
  expect(current.data).toEqual(
    expect.arrayContaining([expect.objectContaining({ type: "todo", id: 17 })])
  );
  expect(current.warnings.join(" ")).toContain("索引暂不可用");
});

it("待办查询合并文档任务并保留原文定位身份", async () => {
  vi.mocked(taskAssistantRequest).mockResolvedValue({
    warnings: [],
    items: [
      {
        taskRef: { kind: "document", contentId: 80, taskId: "t1", createdAt: 1 },
        title: "复盘",
        sourceRef: { kind: "article", id: 8 },
        sourceTitle: "工作记录",
        completed: true,
      },
    ],
  });
  await render("复盘", ["todo", "document-task"]);
  await settle();
  expect(current.data).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ type: "todo", id: 17 }),
      expect.objectContaining({
        type: "document-task",
        id: "80:t1",
        sourceRef: { kind: "article", id: 8 },
        taskId: "t1",
      }),
    ])
  );
  expect(searchHybridContent).not.toHaveBeenCalled();
});

it("切库时不展示前库结果，前库的迟到查询也不能覆盖当前库", async () => {
  await render("2026年", ["todo"]);
  await settle();
  let finishOld: (value: CatalogSearchResult[]) => void = () => {
    throw new Error("旧查询未开始");
  };
  vi.mocked(searchCatalog).mockImplementationOnce(
    () =>
      new Promise(resolve => {
        finishOld = resolve;
      })
  );
  await render("新的关键词", ["todo"]);
  vi.mocked(searchCatalog).mockResolvedValue([]);
  await act(async () =>
    useSettingStore.setState({
      setting: {
        ...originalSetting,
        database: { ...originalSetting.database, active: "other.db" },
      },
    })
  );
  expect(current.data).not.toEqual(expect.arrayContaining([expect.objectContaining({ id: 17 })]));
  await settle();
  await act(async () => finishOld([task]));
  expect(current.data).toEqual([]);
});

it("切换语言只更新来源失败提示，不重复查询或替换结果", async () => {
  const originalLocale = desktopLocaleSource.getSnapshot();
  vi.mocked(searchHybridContent).mockRejectedValue(new Error("原始索引错误"));
  await render();
  await settle();
  const data = current.data;
  const warning = current.warnings.join(" ");
  const calls = [
    vi.mocked(searchHybridContent).mock.calls.length,
    vi.mocked(searchCatalog).mock.calls.length,
    vi.mocked(taskAssistantRequest).mock.calls.length,
  ];
  try {
    await act(async () => desktopLocaleSource.setLocale("en-US"));
    expect(current.data).toBe(data);
    expect(current.warnings.join(" ")).toContain("原始索引错误");
    expect(current.warnings.join(" ")).not.toBe(warning);
    expect([
      vi.mocked(searchHybridContent).mock.calls.length,
      vi.mocked(searchCatalog).mock.calls.length,
      vi.mocked(taskAssistantRequest).mock.calls.length,
    ]).toEqual(calls);
  } finally {
    await act(async () => desktopLocaleSource.setLocale(originalLocale));
  }
});
