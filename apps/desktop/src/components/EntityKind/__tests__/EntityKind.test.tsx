import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { NotebookPen, Puzzle } from "lucide-react";

const state = vi.hoisted(() => ({
  invoke: vi.fn(async (channel: string, args: { ids?: number[] }) => {
    if (channel === "plugin-entities:kinds")
      return [{ pluginId: "tau.weekly-review", kind: "note", label: "周记", icon: "<svg/>" }];
    if (channel === "plugin-entities:owners")
      return (args.ids ?? [])
        .filter(id => id < 100)
        .map(id => ({ id, pluginId: "tau.weekly-review", kind: "note" }));
    throw new Error(`unexpected ${channel}`);
  }),
}));
vi.mock("@/electron", () => ({ invoke: state.invoke }));

import useSettingStore from "@/stores/useSettingStore";
import { queryClient } from "@/queryClient";
import { registerPluginEntityKind } from "@/services/plugin-entity-kinds";
import { renderPluginIconMarkup } from "@/app/plugins/icon-markup";
import { EntityKindIcon, EntityKindLabel } from "../EntityKindIcon";
import { useEntityKindMetaResolver } from "..";

const fallback = { label: "插件内容", icon: Puzzle };
const original = useSettingStore.getState().setting;
let container: HTMLDivElement;
let root: Root;

function render(node: ReactNode) {
  act(() => root.render(node));
}

async function waitFor(check: () => void) {
  for (let attempt = 0; ; attempt++) {
    try {
      check();
      return;
    } catch (error) {
      if (attempt > 50) throw error;
      await act(() => new Promise(resolve => setTimeout(resolve, 10)));
    }
  }
}

const text = () => container.textContent ?? "";
const maskIcons = () => container.querySelectorAll("svg[style*='data:image/svg+xml']");

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  useSettingStore.setState({
    setting: { ...original, database: { ...original.database, active: "main.db" } },
  });
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  queryClient.clear();
  state.invoke.mockClear();
  useSettingStore.setState({ setting: original });
});

describe("内容类型的展示", () => {
  it("插件不运行时按库里保存的声明显示，同一轮的归属查询合并成一次", async () => {
    render(
      <>
        <EntityKindLabel entityRef={{ kind: "plugin-entity", id: 7 }} fallback={fallback} />
        <EntityKindIcon entityRef={{ kind: "plugin-entity", id: 7 }} fallback={fallback} />
        <EntityKindIcon entityRef={{ kind: "plugin-entity", id: 8 }} fallback={fallback} />
        <EntityKindLabel entityRef={{ kind: "plugin-entity", id: 404 }} fallback={fallback} />
        <EntityKindLabel
          entityRef={{ kind: "card", id: 7 }}
          fallback={{ ...fallback, label: "卡片" }}
        />
      </>
    );
    await waitFor(() => expect(text()).toBe("周记插件内容卡片"));
    expect(maskIcons()).toHaveLength(2);
    expect(
      state.invoke.mock.calls.filter(([channel]) => channel === "plugin-entities:owners")
    ).toEqual([["plugin-entities:owners", { databaseName: "main.db", ids: [7, 8, 404] }]]);
  });

  it("运行中登记的类型名优先，图标仍取保存的声明", async () => {
    const dispose = registerPluginEntityKind({
      pluginId: "tau.weekly-review",
      kind: "note",
      label: "每周笔记",
      mentionable: false,
      open: vi.fn(),
    });
    render(
      <>
        <EntityKindLabel entityRef={{ kind: "plugin-entity", id: 7 }} fallback={fallback} />
        <EntityKindIcon entityRef={{ kind: "plugin-entity", id: 7 }} fallback={fallback} />
      </>
    );
    await waitFor(() => expect(text()).toBe("每周笔记"));
    await waitFor(() => expect(maskIcons()).toHaveLength(1));
    act(() => dispose());
    expect(text()).toBe("周记");
  });
});

describe("一批引用的外观", () => {
  it("在列表里拼文本时一次取齐插件内容的类型名，内置类型原样返回", async () => {
    function Titles() {
      const refs = [
        { kind: "plugin-entity", id: 7 },
        { kind: "plugin-entity", id: 404 },
        { kind: "card", id: 7 },
      ];
      const metaOf = useEntityKindMetaResolver(refs);
      return <>{refs.map(ref => `${metaOf(ref, fallback).label} #${ref.id}`).join("|")}</>;
    }
    render(<Titles />);
    await waitFor(() => expect(text()).toBe("周记 #7|插件内容 #404|插件内容 #7"));
    expect(
      state.invoke.mock.calls.filter(([channel]) => channel === "plugin-entities:owners")
    ).toEqual([["plugin-entities:owners", { databaseName: "main.db", ids: [7, 404] }]]);
  });
});

describe("插件图标转成 SVG 文本", () => {
  it("lucide 图标补齐命名空间与尺寸", async () => {
    const markup = await renderPluginIconMarkup(NotebookPen);
    expect(markup.startsWith("<svg")).toBe(true);
    expect(markup).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(markup).toContain("<path");
    const bare = await renderPluginIconMarkup(() =>
      createElement("svg", { viewBox: "0 0 24 24" }, createElement("circle", { r: 4 }))
    );
    expect(bare).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(bare).toContain('width="24"');
  });

  it("不是单个 SVG 时拒绝", async () => {
    await expect(renderPluginIconMarkup(() => createElement("div"))).rejects.toThrow("<svg>");
    await expect(
      renderPluginIconMarkup(() => createElement("svg", { "data-x": "x".repeat(17 * 1024) }))
    ).rejects.toThrow("16 KB");
  });
});
