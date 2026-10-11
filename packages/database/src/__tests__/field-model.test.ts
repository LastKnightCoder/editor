import { afterEach, describe, expect, it, vi } from "vitest";
import { builtInFieldModels, defineFieldModel, type DatabaseFieldModel } from "../model";
import { builtInPlugins } from "../plugins";
import type { ColumnDef } from "../types";

const column = (type: string, config?: unknown): ColumnDef => ({
  id: "col",
  title: "列",
  type,
  config,
});

// builtInFieldModels 的元素按列 config 各自成型，valueType 的函数属性使泛型不变；
// 测试按未知 config 统一收窄（与消费方拿到任意列的实际使用一致）
const modelOf = (type: string): DatabaseFieldModel => {
  const model = builtInFieldModels.find(item => item.type === type);
  if (!model) throw new Error("缺少字段 model：" + type);
  return model as DatabaseFieldModel;
};

/** valueType 可为字面量或按列函数，统一取该列的实际值 */
const valueTypeOf = (model: DatabaseFieldModel, column: ColumnDef) =>
  typeof model.valueType === "function" ? model.valueType(column) : model.valueType;

describe("defineFieldModel", () => {
  it("返回冻结对象，成员不可覆盖", () => {
    const model = defineFieldModel({ type: "x", toText: () => "" });
    expect(Object.isFrozen(model)).toBe(true);
    expect(() => {
      (model as { type: string }).type = "y";
    }).toThrow();
  });
});

describe("builtInFieldModels", () => {
  it("type 集合与 builtInPlugins 一致（防遗漏）", () => {
    expect(builtInFieldModels.map(model => model.type).sort()).toEqual(
      builtInPlugins.map(plugin => plugin.type).sort()
    );
  });

  it("valueType / toScalar 与对应 CellPlugin 的成员同源", () => {
    for (const plugin of builtInPlugins) {
      const model = modelOf(plugin.type);
      expect(model.valueType).toBe(plugin.valueType);
      expect(model.toScalar).toBe(plugin.toScalar);
    }
  });

  it("内置字段不声明 contentRefs", () => {
    for (const model of builtInFieldModels) {
      expect(model.contentRefs).toBeUndefined();
    }
  });
});

describe("内置字段 toText", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("text：原样字符串，空值返回空串", () => {
    const model = modelOf("text");
    expect(model.toText("hello", column("text"))).toBe("hello");
    expect(model.toText(null, column("text"))).toBe("");
    expect(model.toText(undefined, column("text"))).toBe("");
  });

  it("number：沿用数字插件格式化，未配置小数位时非整数保留两位", () => {
    const model = modelOf("number");
    expect(model.toText(1234.5, column("number"))).toBe("1234.50");
    expect(model.toText(5, column("number"))).toBe("5");
    expect(model.toText(1000, column("number", { thousandSeparator: true }))).toBe("1,000");
    expect(model.toText(1234.5, column("number", { precision: 3 }))).toBe("1234.500");
    expect(model.toText(1000, column("number", { thousandSeparator: true, prefix: "¥" }))).toBe(
      "¥1,000"
    );
    expect(model.toText(null, column("number"))).toBe("");
    expect(model.toText("12", column("number"))).toBe("");
  });

  it("select：输出选项名称，找不到选项输出原值", () => {
    const model = modelOf("select");
    const options = [
      { id: "opt1", name: "进行中", color: "blue" },
      { id: "opt2", name: "已完成", color: "green" },
    ];
    expect(model.toText("opt1", column("select", { options }))).toBe("进行中");
    expect(model.toText("gone", column("select", { options }))).toBe("gone");
    expect(model.toText("gone", column("select"))).toBe("gone");
    expect(model.toText(null, column("select", { options }))).toBe("");
    expect(model.toText("", column("select", { options }))).toBe("");
  });

  it("multiSelect：选项名称用「、」连接，找不到选项输出原值", () => {
    const model = modelOf("multiSelect");
    const options = [
      { id: "a", name: "设计", color: "red" },
      { id: "b", name: "开发", color: "orange" },
    ];
    expect(model.toText(["a", "b"], column("multiSelect", { options }))).toBe("设计、开发");
    expect(model.toText(["a", "x"], column("multiSelect", { options }))).toBe("设计、x");
    expect(model.toText([], column("multiSelect", { options }))).toBe("");
    expect(model.toText(null, column("multiSelect", { options }))).toBe("");
  });

  it("checkbox：输出「是」/「否」", () => {
    const model = modelOf("checkbox");
    expect(model.toText(true, column("checkbox"))).toBe("是");
    expect(model.toText(false, column("checkbox"))).toBe("否");
    expect(model.toText(null, column("checkbox"))).toBe("");
  });

  it("progress：输出百分比文本（沿用 formatScalar 口径）", () => {
    const model = modelOf("progress");
    expect(model.toText({ current: 50, target: 200 }, column("progress"))).toBe("25%");
    expect(model.toText({ current: 0, target: 100 }, column("progress"))).toBe("0%");
    expect(model.toText({ current: 3, target: 0 }, column("progress"))).toBe("");
    expect(model.toText({ current: 1 }, column("progress"))).toBe("");
    expect(model.toText(null, column("progress"))).toBe("");
  });

  it("star：输出数字，未评分与空值返回空串", () => {
    const model = modelOf("star");
    expect(model.toText(4.5, column("star", { max: 5 }))).toBe("4.5");
    expect(model.toText(0, column("star", { max: 5 }))).toBe("");
    expect(model.toText(null, column("star", { max: 5 }))).toBe("");
  });

  it("link：原样字符串", () => {
    const model = modelOf("link");
    expect(model.toText("https://example.com", column("link"))).toBe("https://example.com");
    expect(model.toText(null, column("link"))).toBe("");
  });

  it("date：绝对日期文本，与当前时间无关（含时间与范围）", () => {
    const model = modelOf("date");
    const todayEvening = new Date(2026, 9, 11, 14, 30).getTime();
    const tomorrow = new Date(2026, 9, 12, 9, 0).getTime();

    expect(model.toText({ start: null, end: null }, column("date"))).toBe("");
    expect(model.toText(null, column("date"))).toBe("");
    expect(
      model.toText({ start: todayEvening, end: todayEvening }, column("date", { showTime: true }))
    ).toBe("2026年10月11日 周日 14:30");
    expect(model.toText({ start: tomorrow, end: tomorrow }, column("date"))).toBe(
      "2026年10月12日 周一"
    );

    // 「现在」变化不影响输出：不出现今天 / 明天这类相对词
    const at = (now: Date) => {
      vi.spyOn(Date, "now").mockReturnValue(now.getTime());
      return model.toText({ start: tomorrow, end: tomorrow }, column("date"));
    };
    expect(at(new Date(2026, 9, 11, 12, 0))).toBe(at(new Date(2030, 0, 1)));

    const rangeStart = new Date(2026, 9, 12, 9, 0).getTime();
    const rangeEnd = new Date(2026, 9, 15, 18, 0).getTime();
    expect(
      model.toText({ start: rangeStart, end: rangeEnd }, column("date", { isRange: true }))
    ).toBe("2026年10月12日 周一 → 2026年10月15日 周四");
    expect(
      model.toText(
        { start: rangeStart, end: rangeEnd },
        column("date", { isRange: true, showTime: true })
      )
    ).toBe("2026年10月12日 周一 09:00 → 2026年10月15日 周四 18:00");
    expect(model.toText({ start: rangeStart, end: null }, column("date", { isRange: true }))).toBe(
      "2026年10月12日 周一 起"
    );
  });

  it("formula：派生值按结果类型输出文本，error 输出空串", () => {
    const model = modelOf("formula");
    const formulaColumn = (output: string) => column("formula", { output, expr: null });

    expect(model.toText({ value: 3 }, formulaColumn("number"))).toBe("3");
    expect(model.toText({ value: 2.345 }, formulaColumn("number"))).toBe("2.35");
    expect(model.toText({ value: "进行中" }, formulaColumn("text"))).toBe("进行中");
    expect(model.toText({ value: true }, formulaColumn("boolean"))).toBe("是");
    expect(model.toText({ value: new Date(2026, 9, 12).getTime() }, formulaColumn("date"))).toBe(
      "2026-10-12"
    );
    expect(
      model.toText({ value: null, error: "公式之间互相引用了" }, formulaColumn("number"))
    ).toBe("");
    expect(model.toText(null, formulaColumn("number"))).toBe("");
  });

  it("formula：valueType 按列输出结果类型，toScalar 取派生标量", () => {
    const model = modelOf("formula");
    const formulaColumn = (output: string) => column("formula", { output, expr: null });
    expect(valueTypeOf(model, formulaColumn("number"))).toBe("number");
    expect(valueTypeOf(model, formulaColumn("date"))).toBe("date");
    expect(valueTypeOf(model, column("formula"))).toBeUndefined();
    expect(model.toScalar?.({ value: 3 }, formulaColumn("number"))).toBe(3);
    expect(model.toScalar?.({ value: null, error: "x" }, formulaColumn("number"))).toBeNull();
  });
});

describe("内置字段 toScalar（与 CellPlugin 同源抽查）", () => {
  it("date 取 start 时间戳，空值与非法值为 null", () => {
    const model = modelOf("date");
    expect(model.toScalar?.({ start: 100, end: 200 }, column("date"))).toBe(100);
    expect(model.toScalar?.({ start: null, end: 200 }, column("date"))).toBeNull();
    expect(model.toScalar?.(null, column("date"))).toBeNull();
  });

  it("select 输出选项名称，multiSelect 用逗号连接", () => {
    const options = [
      { id: "a", name: "设计", color: "red" },
      { id: "b", name: "开发", color: "orange" },
    ];
    expect(modelOf("select").toScalar?.("a", column("select", { options }))).toBe("设计");
    expect(modelOf("select").toScalar?.("x", column("select", { options }))).toBeNull();
    expect(modelOf("multiSelect").toScalar?.(["a", "b"], column("multiSelect", { options }))).toBe(
      "设计, 开发"
    );
    expect(modelOf("multiSelect").toScalar?.([], column("multiSelect", { options }))).toBeNull();
  });

  it("star 与 progress 输出参与运算的比率口径", () => {
    expect(modelOf("star").toScalar?.(4.5, column("star"))).toBe(4.5);
    expect(modelOf("star").toScalar?.(0, column("star"))).toBeNull();
    expect(modelOf("progress").toScalar?.({ current: 50, target: 200 }, column("progress"))).toBe(
      0.25
    );
    expect(
      modelOf("progress").toScalar?.({ current: 5, target: 0 }, column("progress"))
    ).toBeNull();
  });
});
