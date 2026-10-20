// @vitest-environment node
import { expect, it, vi } from "vitest";
import type { ProjectItem } from "@/types/project";
import { createPublishContentResolver } from "../publish-project-card-list";
import { contentRef } from "../publish-content-link-targets";
import type { PublishedProjectCardListNode } from "@tau/plugins/publish-data";

const list = (projectItemId: number) => ({
  type: "project-card-list" as const,
  projectItemId,
  children: [{ type: "formatted" as const, text: "" }],
});
const item = (id: number, title: string, children: number[] = []) =>
  ({ id, title, children }) as ProjectItem;

it("保留卡片节点并按直属子级顺序生成快照，只读取已发布子文档，重复列表共用读取缓存", () => {
  const records = [
    item(1, "父文档", [3, 99, 2, 4]),
    item(2, "第二篇"),
    item(3, "第一篇"),
    item(99, "未发布的私密标题"),
  ];
  const getProjectItemsByIds = vi.fn((ids: number[]) =>
    records.filter(record => ids.includes(record.id))
  );
  const resolve = createPublishContentResolver({ getProjectItemsByIds }, identity =>
    ["project-item:2", "project-item:3", "project-item:4"].includes(identity)
      ? contentRef("doc", Number(identity.split(":")[1]), 12)
      : undefined
  );
  const source = [list(1)];
  const before = structuredClone(source);
  const nodes = resolve(source);
  expect(nodes[0].type).toBe("project-card-list");
  expect((nodes[0] as PublishedProjectCardListNode).items).toEqual([
    { id: 3, title: "第一篇", summary: "", target: contentRef("doc", 3, 12) },
    { id: 2, title: "第二篇", summary: "", target: contentRef("doc", 2, 12) },
  ]);
  expect(resolve(source)).toEqual(nodes);
  expect(getProjectItemsByIds.mock.calls).toEqual([[[1]], [[3, 2, 4]]]);
  expect(source).toEqual(before);
  expect(JSON.stringify(nodes)).not.toContain("未发布的私密标题");
});

it("嵌套列表保持原位置与容器属性，搜索只使用卡片文字", () => {
  const resolve = createPublishContentResolver(
    {
      getProjectItemsByIds: ids =>
        [item(1, "父文档", [2]), item(2, "文档")].filter(item => ids.includes(item.id)),
    },
    () => contentRef("doc", 2, 12)
  );
  const source = [
    {
      type: "blockquote" as const,
      children: [list(1)],
    },
  ];
  expect(resolve(source)).toEqual([
    {
      ...source[0],
      children: resolve([list(1)]),
    },
  ]);
  expect(resolve([list(1)], true)).toEqual([
    {
      type: "paragraph",
      children: [{ type: "formatted", text: "文档 " }],
    },
  ]);
});

it("父条目已删或没有已发布子文档时输出空列表，查询错误继续抛出", () => {
  const resolve = createPublishContentResolver({ getProjectItemsByIds: () => [] }, () => undefined);
  expect(resolve([list(1)])).toEqual([
    {
      type: "project-card-list",
      items: [],
      children: [{ type: "formatted", text: "" }],
    },
  ]);
  const failing = createPublishContentResolver(
    {
      getProjectItemsByIds: () => {
        throw new Error("读取失败");
      },
    },
    () => undefined
  );
  expect(() => failing([list(1)])).toThrow("读取失败");
});
