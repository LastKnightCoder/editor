import type { ColumnDef } from "../../types";
import { AGGREGATE_LABELS, type FormulaScope } from "../../core/formula";
import {
  COMPARES,
  NO_VALUE,
  type CalcNode,
  type CompareFamily,
  type Condition,
  type FormulaForm,
  type ValueNode,
} from "./model";

const OP_SIGN = { "+": "+", "-": "−", "*": "×", "/": "÷" } as const;

/** 用一句中文复述表单；嵌套处加括号，便于发现写错的地方 */
export function describeForm(
  form: FormulaForm,
  scope: FormulaScope,
  columns: ColumnDef[],
  familyOf: (columnId: string) => CompareFamily | undefined
): string {
  if (!form || form.kind === "unsupported") return "";
  const titleOf = (id: string) => columns.find(column => column.id === id)?.title ?? "选择列";

  const calc = (node: CalcNode, nested: boolean): string => {
    const text = node.terms
      .map((term, index) => (index ? ` ${OP_SIGN[term.op ?? "+"]} ` : "") + say(term.value, true))
      .join("");
    return nested ? `（${text}）` : text;
  };
  const cond = (item: Condition) => {
    const family = item.left.kind === "calc" ? "number" : (familyOf(item.left.columnId) ?? "text");
    const left = item.left.kind === "calc" ? calc(item.left, true) : titleOf(item.left.columnId);
    const name = COMPARES[family].find(([key]) => key === item.cmp)?.[1] ?? "";
    return `${left}${name}${NO_VALUE.has(item.cmp) ? "" : ` ${say(item.value, true)}`}`;
  };
  const conds = (list: Condition[], join: "and" | "or", glue: [string, string]) =>
    list.map(cond).join(join === "and" ? glue[0] : glue[1]);

  function say(node: ValueNode, nested: boolean): string {
    switch (node.kind) {
      case "column":
        return scope === "footer" && node.agg
          ? `${titleOf(node.columnId)}的${AGGREGATE_LABELS[node.agg]}`
          : titleOf(node.columnId);
      case "number":
      case "date":
        return node.value === "" ? "（未填）" : node.value;
      case "text":
        return node.value === "" ? "空" : `「${node.value}」`;
      case "option":
        return node.value ? `「${node.value}」` : "（未选）";
      case "calc":
        return calc(node, nested);
      case "if":
        return `（${node.cases
          .map(
            item => `${conds(item.conds, item.join, ["且", "或"])}时为 ${say(item.result, true)}`
          )
          .join("；")}；否则为 ${say(node.otherwise, true)}）`;
    }
  }

  if (form.kind === "calc") {
    const terms = form.terms.slice(1);
    const notes = [
      terms.some(t => t.op === "*" || t.op === "/") &&
        terms.some(t => t.op === "+" || t.op === "-") &&
        "先算乘除，再算加减",
      form.terms.some(t => t.value.kind === "calc") && "括号里的先算",
    ].filter(Boolean);
    return `结果 = ${calc(form, false)}${notes.length ? `。${notes.join("；")}` : ""}`;
  }
  if (form.kind === "if")
    return [
      ...form.cases.map(
        item =>
          `如果 ${conds(item.conds, item.join, ["，并且", "，或者"])} → 显示 ${say(item.result, true)}`
      ),
      `都不满足 → 显示 ${say(form.otherwise, true)}。从上往下，满足第一种就停`,
    ].join("；");
  return `把 ${form.parts.map(part => say(part, true)).join(" 和 ")} 连起来`;
}
