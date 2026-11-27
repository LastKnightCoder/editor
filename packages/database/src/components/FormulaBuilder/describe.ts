import type { ColumnDef } from "../../types";
import { type FormulaScope } from "../../core/formula";
import {
  COMPARES,
  NO_VALUE,
  type CalcNode,
  type CompareFamily,
  type Condition,
  type FormulaForm,
  type ValueNode,
} from "./model";
import type { DatabaseMessageKey, DatabaseT } from "../../i18n";

const OP_SIGN = { "+": "+", "-": "−", "*": "×", "/": "÷" } as const;

const compareLabelKey = (family: CompareFamily, cmp: string) =>
  `formula.compare.${family}.${cmp}` as DatabaseMessageKey;

/** 用一句本地化文案复述表单；嵌套处加括号，便于发现写错的地方 */
export function describeForm(
  t: DatabaseT,
  form: FormulaForm,
  scope: FormulaScope,
  columns: ColumnDef[],
  familyOf: (columnId: string) => CompareFamily | undefined
): string {
  if (!form || form.kind === "unsupported") return "";
  const titleOf = (id: string) =>
    columns.find(column => column.id === id)?.title ?? t("formula.selectColumn");

  const calc = (node: CalcNode, nested: boolean): string => {
    const text = node.terms
      .map((term, index) => (index ? ` ${OP_SIGN[term.op ?? "+"]} ` : "") + say(term.value, true))
      .join("");
    return nested ? `（${text}）` : text;
  };
  const cond = (item: Condition) => {
    const family = item.left.kind === "calc" ? "number" : (familyOf(item.left.columnId) ?? "text");
    const left = item.left.kind === "calc" ? calc(item.left, true) : titleOf(item.left.columnId);
    const cmp = COMPARES[family].some(([key]) => key === item.cmp)
      ? t(compareLabelKey(family, item.cmp))
      : "";
    return NO_VALUE.has(item.cmp)
      ? t("formula.describe.condNoValue", { left, cmp })
      : t("formula.describe.cond", { left, cmp, value: say(item.value, true) });
  };
  const conds = (list: Condition[], join: "and" | "or", andKey: string, orKey: string) =>
    list.map(cond).join(join === "and" ? andKey : orKey);

  function say(node: ValueNode, nested: boolean): string {
    switch (node.kind) {
      case "column":
        return scope === "footer" && node.agg
          ? t("formula.describe.columnAgg", {
              title: titleOf(node.columnId),
              agg: t(`formula.agg.${node.agg}` as DatabaseMessageKey),
            })
          : titleOf(node.columnId);
      case "number":
      case "date":
        return node.value === "" ? t("formula.describe.unfilled") : node.value;
      case "text":
        return node.value === ""
          ? t("formula.describe.empty")
          : t("formula.describe.quoted", { value: node.value });
      case "option":
        return node.value
          ? t("formula.describe.quoted", { value: node.value })
          : t("formula.describe.unselected");
      case "calc":
        return calc(node, nested);
      case "if":
        return `（${node.cases
          .map(item =>
            t("formula.describe.caseThen", {
              conds: conds(
                item.conds,
                item.join,
                t("formula.describe.and"),
                t("formula.describe.or")
              ),
              result: say(item.result, true),
            })
          )
          .join(t("formula.describe.caseSep"))}；${t("formula.describe.otherwise", {
          result: say(node.otherwise, true),
        })}）`;
    }
  }

  if (form.kind === "calc") {
    const terms = form.terms.slice(1);
    const notes = [
      terms.some(term => term.op === "*" || term.op === "/") &&
        terms.some(term => term.op === "+" || term.op === "-") &&
        t("formula.describe.noteOrder"),
      form.terms.some(term => term.value.kind === "calc") && t("formula.describe.noteParens"),
    ].filter(Boolean);
    return (
      t("formula.describe.result", { expr: calc(form, false) }) +
      (notes.length ? `。${notes.join(t("formula.describe.caseSep"))}` : "")
    );
  }
  if (form.kind === "if")
    return [
      ...form.cases.map(item =>
        t("formula.describe.ifShow", {
          conds: conds(
            item.conds,
            item.join,
            t("formula.describe.andFull"),
            t("formula.describe.orFull")
          ),
          result: say(item.result, true),
        })
      ),
      `${t("formula.describe.elseShow", { result: say(form.otherwise, true) })}。${t(
        "formula.describe.firstMatch"
      )}`,
    ].join(t("formula.describe.caseSep"));
  return t("formula.describe.concat", {
    parts: form.parts.map(part => say(part, true)).join(t("formula.describe.concatJoin")),
  });
}
