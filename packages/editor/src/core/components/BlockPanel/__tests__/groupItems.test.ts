import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { groupBlockPanelItems } from "../groupItems";
import type { IBlockPanelListItem } from "../../../types/block-panel";
const item = (fields: Partial<IBlockPanelListItem>): IBlockPanelListItem => ({
  icon: () => createElement("span"),
  title: "Same title",
  description: "",
  keywords: [],
  ...fields,
});
describe("块插入分组配置", () => {
  it("同名条目不会被合并，指定身份才进入分组且原子项保持顺序", () => {
    const first = item({ onClick: vi.fn() });
    const parent = Object.freeze(item({ id: "example.images", children: [first] }));
    const member = item({ group: "example.images", title: "不同的标题", onClick: vi.fn() });
    const independent = item({ title: parent.title });
    const grouped = groupBlockPanelItems([parent, independent, member]);
    expect(grouped[0].children).toEqual([first, member]);
    expect(grouped[1]).toBe(independent);
    expect(parent.children).toEqual([first]);
    member.title = "Another language";
    expect(grouped[0].children?.[1]).toBe(member);
  });
  it("父条目的插入动作保留为子项，标题 getter 不在分组时冻结", () => {
    let title = "first";
    const parent = item({ id: "example.insert", onClick: vi.fn() });
    Object.defineProperty(parent, "title", { get: () => title });
    const member = item({ group: "example.insert" });
    const [group] = groupBlockPanelItems([parent, member]);
    title = "second";
    expect(group.title).toBe(title);
    expect(group.onClick).toBeUndefined();
    expect(group.children?.[0]).toBe(parent);
    expect(group.children?.[1]).toBe(member);
  });
  it("缺失、重复与成环的目标不吞条目或动作", () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    const cases = [
      [item({ group: "absent" })],
      [item({ id: "a", group: "b" }), item({ id: "b", group: "a" })],
      [item({ id: "a", group: "a" })],
      [item({ id: "a" }), item({ id: "a" }), item({ group: "a" })],
    ];
    try {
      for (const entries of cases) expect(groupBlockPanelItems(entries)).toEqual(entries);
    } finally {
      warning.mockRestore();
    }
  });
});
