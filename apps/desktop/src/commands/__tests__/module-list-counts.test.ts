import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { queryClient } from "@/queryClient";
import { invoke } from "@/electron";
import { updateDataTable } from "../data-table";
import {
  createVLResource,
  deleteVLResource,
  deleteVLResourceComplete,
  ensureVLNoteResource,
} from "../vibe-learning";

vi.mock("@/electron", () => ({ invoke: vi.fn() }));

const noteParams = {
  projectId: 1,
  mainDbName: "test.db",
  contentId: 2,
  title: "笔记",
  noteType: "note",
  originalId: 3,
};

describe("模块列表数量刷新", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    queryClient.clear();
  });

  afterEach(() => queryClient.clear());

  it.each([
    {
      name: "表格行更新",
      key: ["databases", "list"],
      write: () => updateDataTable({ id: 1, rows: [] }),
      result: { id: 1 },
    },
    {
      name: "新增资料",
      key: ["vibe-learning", "list"],
      write: () =>
        createVLResource({
          projectId: 1,
          name: "资料",
          originalPath: "/test.md",
          resourceType: "md",
        }),
      result: { id: 1 },
    },
    {
      name: "删除资料",
      key: ["vibe-learning", "list"],
      write: () => deleteVLResource(1),
      result: true,
    },
    {
      name: "完整删除资料",
      key: ["vibe-learning", "list"],
      write: () =>
        deleteVLResourceComplete({
          resourceId: 1,
          projectId: 1,
          mainDbName: "test.db",
        }),
      result: true,
    },
  ])("$name 后立即返回列表会获取最新数量", async ({ key, write, result }) => {
    const queryFn = vi.fn().mockResolvedValueOnce(0).mockResolvedValueOnce(3);
    const options = { queryKey: key, queryFn, staleTime: 60_000 };
    expect(await queryClient.fetchQuery(options)).toBe(0);
    expect(await queryClient.fetchQuery(options)).toBe(0);
    expect(queryFn).toHaveBeenCalledTimes(1);

    vi.mocked(invoke).mockResolvedValueOnce(result);
    await write();

    expect(await queryClient.fetchQuery(options)).toBe(3);
    expect(queryFn).toHaveBeenCalledTimes(2);
  });

  it("资料已落库但索引入队失败时仍刷新数量", async () => {
    const key = ["vibe-learning", "list"];
    queryClient.setQueryData(key, 0);
    vi.mocked(invoke)
      .mockResolvedValueOnce({ created: true, resource: { id: 1 } })
      .mockRejectedValueOnce(new Error("索引入队失败"));

    await expect(ensureVLNoteResource(noteParams)).rejects.toThrow("索引入队失败");
    expect(queryClient.getQueryState(key)?.isInvalidated).toBe(true);
  });

  it("写入失败、删除失败或复用已有资料不使列表失效", async () => {
    const databaseKey = ["databases", "list"];
    const learningKey = ["vibe-learning", "list"];
    queryClient.setQueryData(databaseKey, 0);
    queryClient.setQueryData(learningKey, 0);
    vi.mocked(invoke).mockRejectedValueOnce(new Error("写入失败"));
    await expect(updateDataTable({ id: 1, rows: [] })).rejects.toThrow("写入失败");
    vi.mocked(invoke).mockResolvedValueOnce(false);
    await deleteVLResourceComplete({ resourceId: 1, projectId: 1, mainDbName: "test.db" });
    vi.mocked(invoke).mockResolvedValueOnce({ created: false, resource: { id: 1 } });
    await ensureVLNoteResource(noteParams);

    expect(queryClient.getQueryState(databaseKey)?.isInvalidated).toBe(false);
    expect(queryClient.getQueryState(learningKey)?.isInvalidated).toBe(false);
  });
});
