/**
 * 「用一句话描述 → 公式」：提示词、解析与校验。模型调用由宿主经 slots.formulaAssist 提供。
 * 模型输出与手动搭建的公式走同一套检查，并且必须能还原成表单，否则不回填。
 */

import type { FormulaAssistMessage } from "../../DatabaseHostContext";
import type PluginManager from "../../PluginManager";
import type { ColumnDef, RowData, SelectOption } from "../../types";
import type { FormulaScope } from "../../core/formula";
import { checkFormula, createFormContext } from "./check";
import { dateToMs, exprToForm, MAX_NEST, type CompareFamily, type FormulaForm } from "./model";

const FAMILY_NAMES: Record<CompareFamily, string> = {
  number: "数字",
  text: "文本",
  select: "单选",
  boolean: "复选框",
  date: "日期",
};

const NODE_GRAMMAR = `表达式节点只能用这些：
- {"kind":"literal","value": 数字 | 文本 | true | false | null}
- {"kind":"column","columnId": 列 id}（只在单行公式里用）
- {"kind":"aggregate","op": "sum"|"avg"|"median"|"min"|"max"|"countAll"|"countNonEmpty"|"countEmpty"|"unique","columnId": 列 id}（只在表尾公式里用）
- {"kind":"binary","op":"+"|"-"|"*"|"/","left": 表达式,"right": 表达式}
- {"kind":"compare","op":">"|">="|"<"|"<="|"=="|"!="|"contains","left": 表达式,"right": 表达式}
- {"kind":"logic","op":"and"|"or","operands":[至少两个条件]}
- {"kind":"empty","operand": 表达式}；「不为空」写 {"kind":"not","operand":{"kind":"empty","operand": 表达式}}
- {"kind":"if","test": 条件,"then": 结果,"else": 结果}；多种情况在 else 里继续写 if
- {"kind":"concat","parts":[表达式, …]}`;

const RULES = `规则：
- 单选列按选项名（文本）比较；复选框写 {"kind":"compare","op":"==","left": 列,"right": true}，未勾选用 "!="。
- 日期常量写成 "YYYY-MM-DD" 文本。
- 按条件显示时，各个结果的类型要一致；用户没说「否则」时 else 用 {"kind":"literal","value":null}。
- 计算或条件里再套计算或条件，最多 ${MAX_NEST} 层。
- 只输出一个 JSON 对象 {"expr": 表达式}，不要解释，不要代码块。`;

const EXAMPLES = `示例（列 id 仅作示意）：
「单价乘数量」→ {"expr":{"kind":"binary","op":"*","left":{"kind":"column","columnId":"price"},"right":{"kind":"column","columnId":"qty"}}}
「金额超过 500 显示高，否则低」→ {"expr":{"kind":"if","test":{"kind":"compare","op":">","left":{"kind":"column","columnId":"amount"},"right":{"kind":"literal","value":500}},"then":{"kind":"literal","value":"高"},"else":{"kind":"literal","value":"低"}}}`;

interface AssistInput {
  prompt: string;
  scope: FormulaScope;
  columns: ColumnDef[];
  /** 可引用的列（不含正在编辑的公式列） */
  usable: ColumnDef[];
  rows: RowData[];
  plugins: PluginManager;
  selfColumnId?: string;
  ask: (messages: FormulaAssistMessage[]) => Promise<string>;
}

export type AssistResult = { ok: true; form: FormulaForm } | { ok: false; message: string };

export function buildSystemPrompt(
  scope: FormulaScope,
  usable: ColumnDef[],
  familyOf: (columnId: string) => CompareFamily | undefined
): string {
  const lines = usable.map(column => {
    const family = familyOf(column.id);
    const options =
      family === "select"
        ? ((column.config as { options?: SelectOption[] } | undefined)?.options ?? [])
            .map(option => option.name)
            .join("、")
        : "";
    const type = family ? FAMILY_NAMES[family] : "其他（只能计数）";
    return `- id=${column.id} 名称=${column.title} 类型=${type}${options ? ` 选项=${options}` : ""}`;
  });
  const scopeText =
    scope === "row"
      ? "当前是单行公式：每一行算出一个值，用 column 引用列，不能用 aggregate。"
      : "当前是表尾公式：先对整列汇总再计算，用 aggregate 引用列，不能用 column。";
  return [
    "你把用户的一句话描述转成数据库公式。",
    NODE_GRAMMAR,
    RULES,
    scopeText,
    `可用的列：\n${lines.join("\n")}`,
    EXAMPLES,
  ].join("\n\n");
}

/** 去掉代码块后截取第一个 { 到最后一个 } */
export function parseAssistOutput(text: string): unknown {
  const cleaned = text.replace(/```(?:json)?/gi, "");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) return undefined;
  try {
    const value = JSON.parse(cleaned.slice(start, end + 1)) as { expr?: unknown };
    return value && typeof value === "object" && "expr" in value ? value.expr : value;
  } catch {
    return undefined;
  }
}

/**
 * 容忍模型的常见偏差：用列名代替 id、日期写成文本。
 * 只做这两种确定的改写，其余交给校验。
 */
export function normalizeAssistExpr(
  input: unknown,
  columns: ColumnDef[],
  familyOf: (columnId: string) => CompareFamily | undefined
): unknown {
  const idOf = (ref: unknown) => {
    if (typeof ref !== "string") return ref;
    if (columns.some(column => column.id === ref)) return ref;
    return columns.find(column => column.title === ref)?.id ?? ref;
  };
  const isDateColumn = (node: unknown) =>
    isRecord(node) && node.kind === "column" && familyOf(String(node.columnId)) === "date";
  const toDate = (node: unknown) => {
    if (!isRecord(node) || node.kind !== "literal" || typeof node.value !== "string") return node;
    const ms = dateToMs(node.value);
    return ms === null ? node : { kind: "literal", value: ms };
  };
  const visit = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(visit);
    if (!isRecord(node)) return node;
    const next: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node))
      next[key] = key === "columnId" ? idOf(value) : visit(value);
    if (next.kind === "compare") {
      if (isDateColumn(next.left)) next.right = toDate(next.right);
      if (isDateColumn(next.right)) next.left = toDate(next.left);
    }
    return next;
  };
  return visit(input);
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** 检查一次输出：能解析、能通过校验、能还原成表单 */
function accept(text: string, input: AssistInput): AssistResult {
  const formCtx = createFormContext(input.columns, input.plugins, input.scope);
  const raw = parseAssistOutput(text);
  if (raw === undefined) return { ok: false, message: "输出不是要求的 JSON" };
  const expr = normalizeAssistExpr(raw, input.columns, formCtx.familyOf);
  const check = checkFormula(
    expr as never,
    input.scope,
    input.columns,
    input.rows,
    input.plugins,
    input.selfColumnId
  );
  if (!check.ok) return { ok: false, message: check.message };
  const form = exprToForm(expr as never, check.output, formCtx);
  if (form?.kind === "unsupported")
    return { ok: false, message: `结构超出了表单能编辑的范围（嵌套最多 ${MAX_NEST} 层）` };
  return { ok: true, form };
}

const ATTEMPTS = 2;

/** 生成公式；不通过时把原因反馈给模型重试一次 */
export async function generateFormula(input: AssistInput): Promise<AssistResult> {
  const formCtx = createFormContext(input.columns, input.plugins, input.scope);
  const messages: FormulaAssistMessage[] = [
    { role: "system", content: buildSystemPrompt(input.scope, input.usable, formCtx.familyOf) },
    { role: "user", content: input.prompt.trim() },
  ];
  let last = "";
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    let text: string;
    try {
      text = (await input.ask(messages)) ?? "";
    } catch (error) {
      return {
        ok: false,
        message: `AI 暂时用不了：${error instanceof Error ? error.message : String(error)}`,
      };
    }
    const result = accept(text, input);
    if (result.ok) return result;
    last = result.message;
    messages.push(
      { role: "assistant", content: text },
      { role: "user", content: `上面的输出有问题：${result.message}。请修正，只输出 JSON。` }
    );
  }
  return { ok: false, message: `没能生成可用的公式（${last}），换个说法试试` };
}
