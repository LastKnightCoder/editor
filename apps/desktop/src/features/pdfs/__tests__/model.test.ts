import { describe, expect, it } from "vitest";
import type { PdfIndexStatus, PdfLibraryItem } from "@/types";
import {
  fileNameFromUrl,
  formatDay,
  matchQuery,
  matchSource,
  pdfTitle,
  recentEntries,
  sortEntries,
  toEntry,
} from "../model";

const item = (patch: Partial<PdfLibraryItem> & { id: number }): PdfLibraryItem => ({
  createTime: 1_000,
  updateTime: 1_000,
  tags: [],
  isLocal: true,
  category: "",
  fileName: `file-${patch.id}.pdf`,
  filePath: `/tmp/file-${patch.id}.pdf`,
  remoteUrl: "",
  pageCount: null,
  lastOpenTime: null,
  lastPage: null,
  annotationCount: 0,
  thumbnailPath: null,
  thumbnailVersion: null,
  fileMissing: false,
  ...patch,
});

const status = (pdfId: number, state: PdfIndexStatus["state"], pageCount = 0): PdfIndexStatus => ({
  pdfId,
  state,
  pageCount,
  updatedAt: null,
});

describe("pdfTitle", () => {
  it("去掉 .pdf 后缀（大小写不敏感），空名兜底", () => {
    expect(pdfTitle("Attention.PDF")).toBe("Attention");
    expect(pdfTitle("报告.v2.pdf")).toBe("报告.v2");
    expect(pdfTitle("")).toBe("未命名 PDF");
  });
});

describe("toEntry", () => {
  it("没有索引库 = 未索引；pending 与 building 都算索引中", () => {
    expect(toEntry(item({ id: 1 })).index).toBe("none");
    expect(toEntry(item({ id: 1 }), status(1, "pending")).index).toBe("building");
    expect(toEntry(item({ id: 1 }), status(1, "building")).index).toBe("building");
    expect(toEntry(item({ id: 1 }), status(1, "ready")).index).toBe("ready");
    expect(toEntry(item({ id: 1 }), status(1, "failed")).index).toBe("failed");
  });

  it("页数优先取行上记录，缺失时回落索引里的页数", () => {
    expect(toEntry(item({ id: 1, pageCount: 12 }), status(1, "ready", 99)).pageCount).toBe(12);
    expect(toEntry(item({ id: 1 }), status(1, "ready", 99)).pageCount).toBe(99);
    expect(toEntry(item({ id: 1 })).pageCount).toBeNull();
  });
});

describe("筛选", () => {
  const local = toEntry(item({ id: 1, fileName: "Deep Learning.pdf" }));
  const remote = toEntry(item({ id: 2, isLocal: false, fileName: "raft.pdf" }));

  it("来源", () => {
    expect([local, remote].filter(e => matchSource(e, "all"))).toHaveLength(2);
    expect([local, remote].filter(e => matchSource(e, "local"))).toEqual([local]);
    expect([local, remote].filter(e => matchSource(e, "remote"))).toEqual([remote]);
  });

  it("搜索按文件名、不分大小写，空白视为不筛", () => {
    expect(matchQuery(local, "deep")).toBe(true);
    expect(matchQuery(local, "raft")).toBe(false);
    expect(matchQuery(local, "  ")).toBe(true);
  });
});

describe("sortEntries / recentEntries", () => {
  const a = toEntry(item({ id: 1, fileName: "b.pdf", createTime: 3, lastOpenTime: 10 }));
  const b = toEntry(item({ id: 2, fileName: "a10.pdf", createTime: 2, annotationCount: 5 }));
  const c = toEntry(item({ id: 3, fileName: "a9.pdf", createTime: 1, lastOpenTime: 20 }));
  const ids = (list: { id: number }[]) => list.map(e => e.id);

  it("最近打开：打开过的在前，从未打开的按添加时间排在后", () => {
    expect(ids(sortEntries([a, b, c], "opened"))).toEqual([3, 1, 2]);
  });

  it("名称按自然序（a9 在 a10 前）", () => {
    expect(ids(sortEntries([a, b, c], "name"))).toEqual([3, 2, 1]);
  });

  it("添加时间 / 标注数降序", () => {
    expect(ids(sortEntries([c, b, a], "added"))).toEqual([1, 2, 3]);
    expect(ids(sortEntries([a, b, c], "annotations"))[0]).toBe(2);
  });

  it("续读行只要打开过且文件还在的", () => {
    const missing = toEntry(item({ id: 4, lastOpenTime: 30, fileMissing: true }));
    expect(ids(recentEntries([a, b, c, missing]))).toEqual([3, 1]);
  });
});

describe("formatDay", () => {
  const now = new Date(2026, 8, 29, 15);
  it("今天 / 昨天 / n 天前 / 月日 / 跨年带年份", () => {
    expect(formatDay(null, now)).toBe("—");
    expect(formatDay(new Date(2026, 8, 29, 1).getTime(), now)).toBe("今天");
    expect(formatDay(new Date(2026, 8, 28, 23).getTime(), now)).toBe("昨天");
    expect(formatDay(new Date(2026, 8, 25).getTime(), now)).toBe("4 天前");
    expect(formatDay(new Date(2026, 5, 3).getTime(), now)).toBe("6/3");
    expect(formatDay(new Date(2025, 11, 31).getTime(), now)).toBe("2025/12/31");
  });
});

describe("fileNameFromUrl", () => {
  it("取路径末段并解码，没有后缀补 .pdf，非法链接返回空", () => {
    expect(fileNameFromUrl("https://arxiv.org/pdf/1706.03762")).toBe("1706.03762.pdf");
    expect(fileNameFromUrl("https://x.com/docs/%E6%8A%A5%E5%91%8A.pdf?x=1")).toBe("报告.pdf");
    expect(fileNameFromUrl("https://x.com/")).toBe("");
    expect(fileNameFromUrl("not a url")).toBe("");
  });
});
