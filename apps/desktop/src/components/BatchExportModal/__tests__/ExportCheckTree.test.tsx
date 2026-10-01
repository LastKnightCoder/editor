import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it } from "vitest";
import ExportCheckTree, { ExportTreeEmpty } from "@/components/BatchExportModal/ExportCheckTree";
import { EProjectItemType } from "@/types";
import type { BatchExportTreeNode } from "@/utils/batch-export";

const node = (
  id: number,
  title: string,
  options: Partial<BatchExportTreeNode> = {}
): BatchExportTreeNode => ({
  id,
  title,
  depth: 0,
  itemType: EProjectItemType.Document,
  exportable: true,
  content: [],
  children: [],
  ...options,
});

const nonDocument = (id: number, title: string, itemType: EProjectItemType) =>
  node(id, title, { itemType, exportable: false });

const TREE: BatchExportTreeNode[] = [
  node(1, "章节一", { empty: true, children: [node(2, "第一篇"), node(3, "第二篇")] }),
  nonDocument(4, "课件", EProjectItemType.Pdf),
  node(5, "草稿", { empty: true }),
  { ...nonDocument(6, "白板分组", EProjectItemType.WhiteBoard), children: [node(7, "白板说明")] },
];

let host: HTMLDivElement;
let root: Root;
let latestKeys: number[] = [];

const Harness = ({ initial }: { initial: number[] }) => {
  const [keys, setKeys] = useState(initial);
  latestKeys = keys;
  return <ExportCheckTree nodes={TREE} checkedKeys={keys} onCheckedKeysChange={setKeys} />;
};

const findRow = (title: string) =>
  [...host.querySelectorAll<HTMLElement>("[role=treeitem] > div")].find(
    row => row.querySelector("span[title]")?.getAttribute("title") === title
  );

const rowOf = (title: string) => {
  const row = findRow(title);
  if (!row) throw new Error(`未找到行：${title}`);
  return row;
};

const pick = <T extends Element>(parent: ParentNode, selector: string) => {
  const el = parent.querySelector<T>(selector);
  if (!el) throw new Error(`未找到元素：${selector}`);
  return el;
};

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

it("勾选节点级联到子树内全部文档，空白文档也可勾选", () => {
  act(() => root.render(<Harness initial={[]} />));
  act(() => rowOf("章节一").click());
  expect(latestKeys.sort()).toEqual([1, 2, 3]);
  act(() => rowOf("章节一").click());
  expect(latestKeys).toEqual([]);
});

it("点击勾选框只切换一次，不与整行点击叠加", () => {
  act(() => root.render(<Harness initial={[1, 2, 3]} />));
  const checkbox = pick<HTMLInputElement>(rowOf("第一篇"), "input[type=checkbox]");
  act(() => checkbox.click());
  expect(latestKeys).toEqual([1, 3]);
});

it("非文档条目标出类型并禁勾，空白文档只做标识", () => {
  act(() => root.render(<Harness initial={[]} />));
  const pdf = rowOf("课件");
  expect(pick<HTMLInputElement>(pdf, "input").disabled).toBe(true);
  expect(pdf.textContent).toContain("PDF");
  act(() => pdf.click());
  expect(latestKeys).toEqual([]);

  const draft = rowOf("草稿");
  expect(draft.textContent).toContain("空白");
  act(() => draft.click());
  expect(latestKeys).toEqual([5]);
});

it("非文档条目下有文档时可整组勾选", () => {
  act(() => root.render(<Harness initial={[]} />));
  const board = rowOf("白板分组");
  expect(board.textContent).toContain("白板");
  expect(pick<HTMLInputElement>(board, "input").disabled).toBe(false);
  act(() => board.click());
  expect(latestKeys).toEqual([7]);
});

it("折叠后隐藏子节点并显示已选计数", () => {
  act(() => root.render(<Harness initial={[2]} />));
  const fold = pick<HTMLButtonElement>(rowOf("章节一"), "button[aria-label=折叠]");
  act(() => fold.click());
  expect(findRow("第一篇")).toBeUndefined();
  expect(rowOf("章节一").textContent).toContain("1/3");
  expect(latestKeys).toEqual([2]);
});

it("没有文档时空态说明原因", () => {
  act(() => root.render(<ExportTreeEmpty />));
  expect(host.textContent).toContain("这个项目里没有文档");
});
