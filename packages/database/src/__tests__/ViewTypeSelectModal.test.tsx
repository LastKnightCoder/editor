import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import ViewTypeSelectModal from "../ViewTypeSelectModal";
import PluginManager from "../PluginManager";
import { builtInPlugins } from "../plugins";
import type { ColumnDef } from "../types";

let root: Root | undefined;
let host: HTMLDivElement;

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = undefined;
  host?.remove();
});

const buildPluginManager = () => {
  const pluginManager = new PluginManager();
  pluginManager.registerPlugins(builtInPlugins as never);
  return pluginManager;
};

const withCapabilities = (): ColumnDef[] => [
  { id: "title", title: "标题", type: "text", width: 200, isPrimary: true },
  { id: "due", title: "日期", type: "date", width: 140 },
  {
    id: "status",
    title: "状态",
    type: "select",
    width: 120,
    config: { options: [{ id: "todo", name: "待处理", color: "blue" as const }] },
  },
];

const textOnlyColumns = (): ColumnDef[] => [
  { id: "title", title: "标题", type: "text", width: 200, isPrimary: true },
];

const renderModal = (columns: ColumnDef[], onConfirm = vi.fn()) => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  void act(() => {
    root!.render(
      <ViewTypeSelectModal
        open
        onCancel={() => {}}
        onConfirm={onConfirm}
        columns={columns}
        pluginManager={buildPluginManager()}
        theme="light"
      />
    );
  });
  return onConfirm;
};

/** 弹窗与浮层都经 Portal 挂到 body，统一查整棵文档树 */
const bodyButton = (text: string) =>
  Array.from(document.body.querySelectorAll("button")).find(
    button => button.textContent?.trim() === text
  );

const viewTypeCard = (name: string) =>
  Array.from(document.body.querySelectorAll("button")).find(
    button => button.querySelector("span.text-tau-body")?.textContent === name
  );

const click = (el: Element) =>
  act(() => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  });

describe("ViewTypeSelectModal（注册表驱动）", () => {
  it("四类视图按注册表顺序展示，候选列充足时全部可选", () => {
    renderModal(withCapabilities());

    const names = Array.from(document.body.querySelectorAll("span.text-tau-body"))
      .map(span => span.textContent)
      .filter(Boolean);
    expect(names).toEqual(["表格", "画廊", "日历", "看板"]);
    for (const name of names) {
      expect(viewTypeCard(name!)!.hasAttribute("disabled")).toBe(false);
    }
  });

  it("无日期列 / 单选列时对应视图禁用并展示原因", () => {
    renderModal(textOnlyColumns());

    expect(viewTypeCard("表格")!.hasAttribute("disabled")).toBe(false);
    expect(viewTypeCard("画廊")!.hasAttribute("disabled")).toBe(false);

    const calendar = viewTypeCard("日历")!;
    expect(calendar.hasAttribute("disabled")).toBe(true);
    expect(calendar.getAttribute("title")).toBe("需要至少一个日期列");
    expect(calendar.textContent).toContain("需要至少一个日期列");

    const kanban = viewTypeCard("看板")!;
    expect(kanban.hasAttribute("disabled")).toBe(true);
    expect(kanban.getAttribute("title")).toBe("需要至少一个单选列");
  });

  it("创建看板：自动命名、选定分组列后才能确认，payload 携带列 id", () => {
    const onConfirm = renderModal(withCapabilities());

    click(viewTypeCard("看板")!);
    const nameInput = document.body.querySelector<HTMLInputElement>(
      'input[placeholder="请输入视图名称"]'
    )!;
    expect(nameInput).toBeTruthy();
    expect(nameInput.value).toBe("看板");

    // 注册表驱动的列选择器：标签与占位文案
    expect(document.body.textContent).toContain("分组列");
    const trigger = document.body.querySelector<HTMLButtonElement>('button[role="combobox"]')!;
    expect(trigger).toBeTruthy();
    expect(trigger.textContent).toContain("选择用于看板分组的单选列");

    const createButton = bodyButton("创建")!;
    expect(createButton.hasAttribute("disabled")).toBe(true);

    click(trigger);
    const option = Array.from(document.body.querySelectorAll('[role="option"]')).find(el =>
      el.textContent?.includes("状态")
    )!;
    expect(option).toBeTruthy();
    click(option);

    expect(bodyButton("创建")!.hasAttribute("disabled")).toBe(false);
    click(bodyButton("创建")!);

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledWith("kanban", "看板", "status");
  });

  it("创建日历：payload 携带日期列 id", () => {
    const onConfirm = renderModal(withCapabilities());

    click(viewTypeCard("日历")!);
    expect(document.body.textContent).toContain("日期列");

    const trigger = document.body.querySelector<HTMLButtonElement>('button[role="combobox"]')!;
    click(trigger);
    const option = Array.from(document.body.querySelectorAll('[role="option"]')).find(el =>
      el.textContent?.includes("日期")
    )!;
    click(option);
    click(bodyButton("创建")!);

    expect(onConfirm).toHaveBeenCalledWith("calendar", "日历", "due");
  });

  it("表格无需选列即可创建，columnId 为 undefined", () => {
    const onConfirm = renderModal(withCapabilities());

    click(viewTypeCard("表格")!);
    expect(document.body.querySelector('button[role="combobox"]')).toBeNull();
    expect(bodyButton("创建")!.hasAttribute("disabled")).toBe(false);
    click(bodyButton("创建")!);

    expect(onConfirm).toHaveBeenCalledWith("table", "表格", undefined);
  });
});
