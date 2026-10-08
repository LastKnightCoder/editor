import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import PluginManager from "../../../PluginManager";
import { builtInPlugins } from "../../../plugins";
import type { CellPlugin, ColumnDef, RowData } from "../../../types";
import FormulaBuilder from "..";
import type { FormulaForm } from "../model";

const columns: ColumnDef[] = [
  { id: "title", title: "任务", type: "text", isPrimary: true },
  { id: "cost", title: "成本", type: "number" },
  { id: "qty", title: "数量", type: "number" },
];
const rows: RowData[] = [
  { id: "r1", title: "设计", cost: 220, qty: 3 },
  { id: "r2", title: "实现", cost: 80, qty: 5 },
];
const plugins = new PluginManager();
plugins.registerPlugins(builtInPlugins as CellPlugin<unknown>[]);

let latest: FormulaForm = null;
const Host = ({ initial }: { initial: FormulaForm }) => {
  const [form, setForm] = useState<FormulaForm>(initial);
  latest = form;
  return (
    <FormulaBuilder
      scope="row"
      value={form}
      onChange={setForm}
      columns={columns}
      rows={rows}
      pluginManager={plugins}
      selfColumnId="f"
      resultLabel="小计"
    />
  );
};

describe("FormulaBuilder", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  const render = (initial: FormulaForm) => act(() => root.render(<Host initial={initial} />));
  const text = () => host.textContent ?? "";
  const clickText = async (label: string, scope: ParentNode = host) => {
    const target = [...scope.querySelectorAll<HTMLElement>("button")].find(
      el => el.getAttribute("aria-label") === label || el.textContent?.trim().startsWith(label)
    );
    expect(target, label).toBeDefined();
    await act(async () => target?.click());
  };
  const type = (input: HTMLInputElement, value: string) =>
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  const numberInput = () => {
    const input = host.querySelector<HTMLInputElement>('input[aria-label="数字"]');
    if (!input) throw new Error("缺少数字输入框");
    return input;
  };
  /** 只在打开的菜单里找项（菜单关闭时仍挂载在 DOM 中） */
  const pickMenu = async (label: string) => {
    const target = [
      ...document.querySelectorAll<HTMLElement>('[role="menu"][data-open="true"] [data-menu-item]'),
    ].find(el => el.textContent?.trim().startsWith(label));
    expect(target, label).toBeDefined();
    await act(async () => target?.click());
  };
  const moreButtons = () => host.querySelectorAll<HTMLElement>('[aria-label="更多选择"]');

  it("先选意图，计算表单直接出预览与复述", async () => {
    render(null);
    expect(text()).toContain("想算什么");
    await clickText("计算", host);
    expect(text()).toContain("结果 = 成本 + （未填）");
    type(numberInput(), "10");
    expect(text()).toContain("设计220230");
    expect(text()).not.toMatch(/kind|literal|\{/);
  });

  it("值框可改成计算并撤销，嵌套到上限后变灰", async () => {
    const start: FormulaForm = {
      kind: "calc",
      terms: [
        { value: { kind: "column", columnId: "cost" } },
        { op: "*", value: { kind: "column", columnId: "qty" } },
      ],
    };
    render(start);
    await act(async () => moreButtons()[1].click());
    await pickMenu("改成计算");
    expect(text()).toContain("结果 = 成本 × （数量 + （未填））");
    expect(text()).toContain("括号里的先算");

    type(numberInput(), "1");
    expect(text()).toContain("设计2203880");

    await act(async () => moreButtons()[2].click());
    await pickMenu("改成计算");
    await act(async () => moreButtons()[3].click());
    expect(document.querySelector('[role="menu"][data-open="true"]')?.textContent).toContain(
      "已经套了 2 层"
    );
    await act(async () =>
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))
    );

    await clickText("撤销", host);
    await clickText("撤销", host);
    expect(latest).toEqual(start);
  });

  it("每一处都能删，剩一个时不再显示删除", async () => {
    render(null);
    await clickText("拼接文字", host);
    expect(host.querySelectorAll('[aria-label="移除这一段"]').length).toBe(2);
    await act(async () => host.querySelector<HTMLElement>('[aria-label="移除这一段"]')?.click());
    expect(host.querySelectorAll('[aria-label="移除这一段"]').length).toBe(0);

    await clickText("换一种", host);
    await clickText("按条件显示", host);
    await clickText("＋ 再加一个条件", host);
    await clickText("＋ 再加一种情况", host);
    expect(host.querySelectorAll('[aria-label="移除条件"]').length).toBe(2);
    await clickText("删除这种情况", host);
    expect(text()).not.toContain("情况 2");
  });

  it("类型错误给出人话原因", () => {
    render({
      kind: "if",
      slot: "text",
      cases: [
        {
          join: "and",
          conds: [
            {
              left: { kind: "column", columnId: "cost" },
              cmp: "gt",
              value: { kind: "number", value: "100" },
            },
          ],
          result: { kind: "text", value: "高" },
        },
      ],
      otherwise: { kind: "column", columnId: "qty" },
    });
    expect(text()).toContain("「是」和「否」两个结果的类型要一致");
  });
});
