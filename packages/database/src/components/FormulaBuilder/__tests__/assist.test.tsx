import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import PluginManager from "../../../PluginManager";
import { builtInPlugins } from "../../../plugins";
import { DatabaseHostContext } from "../../../DatabaseHostContext";
import type { CellPlugin, ColumnDef, RowData } from "../../../types";
import FormulaBuilder from "..";
import { buildSystemPrompt, generateFormula, parseAssistOutput } from "../assist";
import { createFormContext } from "../check";
import { dateToMs, formToExpr, type FormulaForm } from "../model";

const columns: ColumnDef[] = [
  { id: "title", title: "任务", type: "text", isPrimary: true },
  {
    id: "status",
    title: "状态",
    type: "select",
    config: { options: [{ id: "s1", name: "已完成", color: "gray" }] },
  },
  { id: "cost", title: "成本", type: "number" },
  { id: "qty", title: "数量", type: "number" },
  { id: "due", title: "截止", type: "date" },
];
const rows: RowData[] = [{ id: "r1", title: "设计", cost: 220, qty: 3 }];
const plugins = new PluginManager();
plugins.registerPlugins(builtInPlugins as CellPlugin<unknown>[]);

const priority = {
  kind: "if",
  test: {
    kind: "compare",
    op: ">",
    left: {
      kind: "binary",
      op: "*",
      left: { kind: "column", columnId: "成本" },
      right: { kind: "column", columnId: "qty" },
    },
    right: { kind: "literal", value: 500 },
  },
  then: { kind: "literal", value: "高" },
  else: { kind: "literal", value: "低" },
};

const input = (ask: (messages: unknown[]) => Promise<string>) => ({
  prompt: "成本乘数量超过 500 就显示高",
  scope: "row" as const,
  columns,
  usable: columns,
  rows,
  plugins,
  ask,
});

describe("AI 生成公式", () => {
  it("提示词列出列与选项，不含行数据", () => {
    const prompt = buildSystemPrompt(
      "row",
      columns,
      createFormContext(columns, plugins, "row").familyOf
    );
    expect(prompt).toContain("id=status 名称=状态 类型=单选 选项=已完成");
    expect(prompt).toContain("id=due 名称=截止 类型=日期");
    expect(prompt).not.toContain("设计");
  });

  it("解析时容忍代码块与多余文字", () => {
    expect(
      parseAssistOutput('好的：\n```json\n{"expr":{"kind":"literal","value":1}}\n```')
    ).toEqual({
      kind: "literal",
      value: 1,
    });
    expect(parseAssistOutput("抱歉")).toBeUndefined();
  });

  it("用列名代替 id、日期写成文本也能接受", async () => {
    const ask = vi.fn().mockResolvedValueOnce(JSON.stringify({ expr: priority }));
    const result = await generateFormula(input(ask));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.form).toMatchObject({
      kind: "if",
      cases: [{ conds: [{ left: { kind: "calc" } }] }],
    });

    const dated = vi.fn().mockResolvedValueOnce(
      JSON.stringify({
        expr: {
          kind: "if",
          test: {
            kind: "compare",
            op: "<",
            left: { kind: "column", columnId: "due" },
            right: { kind: "literal", value: "2026-10-10" },
          },
          then: { kind: "literal", value: "逾期" },
          else: { kind: "literal", value: null },
        },
      })
    );
    const second = await generateFormula(input(dated));
    expect(second.ok && formToExpr(second.form, "row")).toMatchObject({
      test: { right: { value: dateToMs("2026-10-10") } },
    });
  });

  it("不通过时把原因反馈给模型重试，两次都不行就放弃", async () => {
    const bad = JSON.stringify({
      expr: {
        kind: "binary",
        op: "*",
        left: { kind: "column", columnId: "title" },
        right: { kind: "literal", value: 2 },
      },
    });
    const ask = vi
      .fn()
      .mockResolvedValueOnce(bad)
      .mockResolvedValueOnce(JSON.stringify({ expr: priority }));
    expect((await generateFormula(input(ask))).ok).toBe(true);
    expect(ask).toHaveBeenCalledTimes(2);
    expect(ask.mock.calls[1][0].at(-1).content).toContain("「乘」两边都要是数字");

    const never = vi.fn().mockResolvedValue("不知道");
    expect(await generateFormula(input(never))).toEqual({
      ok: false,
      message: "没能生成可用的公式（输出不是要求的 JSON），换个说法试试",
    });
    expect(never).toHaveBeenCalledTimes(2);

    const broken = vi.fn().mockRejectedValue(new Error("网络错误"));
    expect(await generateFormula(input(broken))).toEqual({
      ok: false,
      message: "AI 暂时用不了：网络错误",
    });
  });

  it("宿主提供能力时显示输入框，生成结果填进表单", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    let latest: FormulaForm = null;
    const Host = () => {
      const [form, setForm] = useState<FormulaForm>(null);
      latest = form;
      return (
        <FormulaBuilder
          scope="row"
          value={form}
          onChange={setForm}
          columns={columns}
          rows={rows}
          pluginManager={plugins}
        />
      );
    };
    act(() => root.render(<Host />));
    expect(host.querySelector('[aria-label="用一句话描述公式"]')).toBeNull();

    const formulaAssist = vi.fn().mockResolvedValue(JSON.stringify({ expr: priority }));
    act(() =>
      root.render(
        <DatabaseHostContext.Provider value={{ formulaAssist }}>
          <Host />
        </DatabaseHostContext.Provider>
      )
    );
    const field = host.querySelector<HTMLInputElement>('[aria-label="用一句话描述公式"]');
    if (!field) throw new Error("缺少 AI 输入框");
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(
        field,
        "成本乘数量超过 500 显示高"
      );
      field.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => {
      field.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
    expect(latest).toMatchObject({ kind: "if" });
    expect(host.textContent).toContain("如果 （成本 × 数量）大于 500 → 显示 「高」");
    act(() => root.unmount());
    host.remove();
  });
});
