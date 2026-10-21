// 脉络面板的「被关联」分区：插件内容按插件声明的类型名显示，移动端没有插件内容页，只读展示。

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { EntityContext } from "../types";

const push = vi.fn();
vi.mock("../../../router", () => ({ useNavigator: () => ({ push }) }));

import { ContextSheet } from "../ContextSheet";

const entity = (kind: "card" | "plugin-entity", id: number, title: string, kindLabel?: string) => ({
  kind,
  id,
  contentId: 0,
  title,
  meta: "",
  diary: null,
  kindLabel: kindLabel ?? null,
});

const context: EntityContext = {
  selfEntity: entity("card", 1, "自身"),
  selfContentIds: [10],
  links: [],
  projections: [],
  backlinks: [{ source: entity("plugin-entity", 8, "周记", "周记"), snippets: [] }],
  backlinkTotal: 1,
  questions: [],
  pluginLinks: [entity("plugin-entity", 7, "渲染为什么卡", "问题")],
  sources: [],
  derived: [],
  notebookProjections: [],
  usages: [],
  aiMeta: null,
  inlineSources: [],
};

let root: Root | null = null;
afterEach(async () => {
  await act(async () => root?.unmount());
  root = null;
  document.body.innerHTML = "";
});

describe("ContextSheet", () => {
  it("被关联：显示插件声明的类型名，计入总数，不可点击", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    await act(async () => root!.render(<ContextSheet open context={context} onClose={() => {}} />));
    const text = document.body.textContent ?? "";
    expect(text).toContain("脉络 · 2");
    expect(text).toContain("被关联 · 1");
    expect(text).toContain("问题渲染为什么卡");
    // 插件内容没有承载页面：行不是按钮
    const buttons = [...document.querySelectorAll("button")].map(button => button.textContent);
    expect(buttons.some(label => label?.includes("渲染为什么卡"))).toBe(false);
    expect(buttons.some(label => label?.includes("周记"))).toBe(false);
  });
});
