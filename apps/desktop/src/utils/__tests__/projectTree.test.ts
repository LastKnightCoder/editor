import { describe, expect, it, vi } from "vitest";
import { EProjectItemType, EProjectType, type Project, type ProjectItem } from "@/types";

vi.mock("@/commands", () => ({ getProjectItemsByIds: vi.fn() }));

import {
  buildProjectTreeData,
  collectAncestorItemIds,
  isSameNumberSet,
  type ProjectTreeData,
} from "../projectTree";

// 结构：project(7) ─┬─ 1 ── 11 ── 111（深层链）
//                   └─ 2 ── 11（同一文档多处挂载）
const project: Project = {
  id: 7,
  title: "项目",
  children: [1, 2],
  createTime: 1,
  updateTime: 1,
  desc: [],
  archived: false,
  pinned: false,
  projectType: EProjectType.DocumentTree,
};

const makeItem = (id: number, children: number[] = []): ProjectItem => ({
  id,
  title: `条目 ${id}`,
  children,
  createTime: 1,
  updateTime: 1,
  content: [],
  parents: [],
  projects: [7],
  refType: "",
  refId: 0,
  projectItemType: EProjectItemType.Document,
  count: 0,
  contentId: id,
  whiteBoardContentId: 0,
});

const treeData: ProjectTreeData = buildProjectTreeData(
  project,
  new Map(
    [makeItem(1, [11]), makeItem(2, [11]), makeItem(11, [111]), makeItem(111)].map(item => [
      item.id,
      item,
    ])
  )
);

describe("collectAncestorItemIds", () => {
  it("顶层条目无祖先，返回空集合", () => {
    expect(collectAncestorItemIds(treeData, 1).size).toBe(0);
  });

  it("深层嵌套条目收集全部祖先链（父级多处挂载时并集传导给子孙）", () => {
    expect(collectAncestorItemIds(treeData, 111)).toEqual(new Set([1, 2, 11]));
  });

  it("多处挂载条目收集各路径祖先的并集", () => {
    expect(collectAncestorItemIds(treeData, 11)).toEqual(new Set([1, 2]));
  });

  it("条目不在树中时返回空集合", () => {
    expect(collectAncestorItemIds(treeData, 999).size).toBe(0);
  });
});

describe("isSameNumberSet", () => {
  it("双方均为 undefined 时视为相等", () => {
    expect(isSameNumberSet(undefined, undefined)).toBe(true);
  });

  it("一方为 undefined 时不相等", () => {
    expect(isSameNumberSet(new Set([1]), undefined)).toBe(false);
    expect(isSameNumberSet(undefined, new Set([1]))).toBe(false);
  });

  it("内容一致时相等，与引用无关", () => {
    expect(isSameNumberSet(new Set([1, 2]), new Set([2, 1]))).toBe(true);
  });

  it("大小或内容不同时不相等", () => {
    expect(isSameNumberSet(new Set([1]), new Set([1, 2]))).toBe(false);
    expect(isSameNumberSet(new Set([1, 2]), new Set([1, 3]))).toBe(false);
  });
});
