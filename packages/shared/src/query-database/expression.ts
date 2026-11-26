import type { QueryColumn, QueryColumnType, QueryContext, QueryRecord, QueryValue } from "./types";

export interface Token {
  text: string;
  offset: number;
  value?: QueryValue;
  literal?: boolean;
}
export type Expression =
  | { kind: "literal"; value: QueryValue }
  | { kind: "field"; name: string }
  | { kind: "call"; name: string; args: Expression[] }
  | { kind: "unary"; op: string; value: Expression }
  | { kind: "binary"; op: string; left: Expression; right: Expression };

export function tokenize(code: string): Token[] {
  const tokens: Token[] = [];
  let offset = 0;
  while (offset < code.length) {
    const remaining = code.slice(offset);
    const whitespace = /^(?:\s+|\/\/[^\n]*(?:\n|$))/.exec(remaining);
    if (whitespace) {
      offset += whitespace[0].length;
      continue;
    }
    const start = offset;
    if (remaining[0] === '"' || remaining[0] === "'") {
      const quote = remaining[0];
      let value = "";
      let closed = false;
      offset++;
      while (offset < code.length) {
        const char = code[offset++];
        if (char === quote) {
          closed = true;
          break;
        }
        if (char === "\\") {
          const escaped = code[offset++];
          if (escaped === undefined) break;
          if (escaped === "u") {
            const hex = code.slice(offset, offset + 4);
            if (!/^[0-9a-fA-F]{4}$/.test(hex))
              throw new Error(`第 ${offset + 1} 字符：Unicode 转义无效`);
            value += String.fromCharCode(parseInt(hex, 16));
            offset += 4;
          } else
            value +=
              ({ n: "\n", r: "\r", t: "\t", b: "\b", f: "\f" } as Record<string, string>)[
                escaped
              ] ?? escaped;
        } else value += char;
      }
      if (!closed) throw new Error(`第 ${start + 1} 字符：字符串未闭合`);
      tokens.push({ text: code.slice(start, offset), offset: start, value, literal: true });
      continue;
    }
    const number = /^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/.exec(remaining);
    if (number) {
      tokens.push({ text: number[0], offset, value: Number(number[0]), literal: true });
      offset += number[0].length;
      continue;
    }
    const word = /^[\p{L}_$][\p{L}\p{N}_$]*(?:\.[\p{L}_$][\p{L}\p{N}_$]*)*/u.exec(remaining);
    if (word) {
      tokens.push({ text: word[0], offset });
      offset += word[0].length;
      continue;
    }
    const operator = /^(?:>=|<=|!=|==|&&|\|\||[(),+*/%<>=!\-])/.exec(remaining);
    if (!operator) throw new Error(`第 ${offset + 1} 字符：无法识别 ${remaining[0]}`);
    tokens.push({ text: operator[0], offset });
    offset += operator[0].length;
  }
  return tokens;
}

const precedence: Record<string, number> = {
  OR: 1,
  "||": 1,
  AND: 2,
  "&&": 2,
  "=": 3,
  "==": 3,
  "!=": 3,
  ">": 3,
  "<": 3,
  ">=": 3,
  "<=": 3,
  IN: 3,
  "+": 4,
  "-": 4,
  "*": 5,
  "/": 5,
  "%": 5,
};
export class Parser {
  position = 0;
  constructor(readonly tokens: Token[]) {}
  peek() {
    return this.tokens[this.position];
  }
  at(text: string) {
    return this.peek()?.text.toUpperCase() === text.toUpperCase() && !this.peek()?.literal;
  }
  take() {
    const token = this.tokens[this.position++];
    if (!token) throw new Error("查询意外结束");
    return token;
  }
  expect(text: string) {
    if (!this.at(text)) throw new Error(`第 ${(this.peek()?.offset ?? 0) + 1} 字符：需要 ${text}`);
    return this.take();
  }
  expression(min = 0): Expression {
    const token = this.take();
    let left: Expression;
    const upper = token.text.toUpperCase();
    if (token.literal) left = { kind: "literal", value: token.value ?? null };
    else if (["TRUE", "FALSE", "NULL"].includes(upper))
      left = { kind: "literal", value: upper === "NULL" ? null : upper === "TRUE" };
    else if (["NOT", "!", "-", "+"].includes(upper))
      left = { kind: "unary", op: upper, value: this.expression(upper === "NOT" ? 3 : 6) };
    else if (token.text === "(") {
      left = this.expression();
      this.expect(")");
    } else if (this.at("(")) {
      this.take();
      const args: Expression[] = [];
      if (!this.at(")"))
        do {
          args.push(this.expression());
          if (!this.at(",")) break;
          this.take();
        } while (true);
      this.expect(")");
      left = { kind: "call", name: token.text.toLowerCase(), args };
    } else {
      if (!/^[\p{L}_$]/u.test(token.text))
        throw new Error(`第 ${token.offset + 1} 字符：需要字段或表达式`);
      left = { kind: "field", name: token.text };
    }
    while (this.peek() && !this.peek()?.literal) {
      const op = this.peek().text.toUpperCase();
      const rank = precedence[op];
      if (rank === undefined || rank < min) break;
      this.take();
      left = { kind: "binary", op, left, right: this.expression(rank + 1) };
    }
    return left;
  }
}

export interface Evaluation {
  row: QueryRecord;
  context: QueryContext;
  group?: QueryRecord[];
  types?: WeakMap<Expression, QueryColumnType | undefined>;
}

export function dateScalar(value: QueryValue): number | null {
  if (value === null) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") throw new Error("日期比较需要日期或时间戳");
  const time = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(value + "T00:00:00").getTime()
    : Date.parse(value);
  if (!Number.isFinite(time)) throw new Error("日期值无效");
  return time;
}
function lookup(row: QueryRecord | Record<string, QueryValue>, path: string): QueryValue {
  let value: QueryValue = row;
  for (const part of path.split(".")) {
    if (["__proto__", "prototype", "constructor"].includes(part)) throw new Error("不可访问该字段");
    if (!value || typeof value !== "object" || !Object.hasOwn(value, part)) return null;
    value = (value as Record<string, QueryValue>)[part];
  }
  return value;
}
export function evaluate(expression: Expression, scope: Evaluation): QueryValue {
  if (expression.kind === "literal") return expression.value;
  if (expression.kind === "field")
    return expression.name.startsWith("params.")
      ? lookup(scope.context.params, expression.name.slice(7))
      : lookup(scope.row, expression.name);
  if (expression.kind === "unary") {
    const value = evaluate(expression.value, scope);
    return expression.op === "NOT" || expression.op === "!"
      ? !value
      : expression.op === "-"
        ? -Number(value)
        : Number(value);
  }
  if (expression.kind === "binary") {
    let left = evaluate(expression.left, scope);
    if (["AND", "&&"].includes(expression.op))
      return Boolean(left) && Boolean(evaluate(expression.right, scope));
    if (["OR", "||"].includes(expression.op))
      return Boolean(left) || Boolean(evaluate(expression.right, scope));
    let right = evaluate(expression.right, scope);
    if (
      ["=", "==", "!=", ">", "<", ">=", "<="].includes(expression.op) &&
      (scope.types?.get(expression.left) === "date" ||
        scope.types?.get(expression.right) === "date")
    ) {
      left = dateScalar(left);
      right = dateScalar(right);
    }
    switch (expression.op) {
      case "=":
      case "==":
        return left === right;
      case "!=":
        return left !== right;
      case "IN":
        return Array.isArray(right) && right.includes(left);
      case ">":
        return left !== null && right !== null && left > right;
      case "<":
        return left !== null && right !== null && left < right;
      case ">=":
        return left !== null && right !== null && left >= right;
      case "<=":
        return left !== null && right !== null && left <= right;
      case "+":
        return typeof left === "string" || typeof right === "string"
          ? String(left ?? "") + String(right ?? "")
          : Number(left) + Number(right);
      case "-":
        return Number(left) - Number(right);
      case "*":
        return Number(left) * Number(right);
      case "/":
        return right === 0 || right === null ? null : Number(left) / Number(right);
      case "%":
        return right === 0 || right === null ? null : Number(left) % Number(right);
    }
  }
  if (expression.kind !== "call") throw new Error("无效的表达式");
  const args = expression.args;
  const get = (index: number) => (args[index] ? evaluate(args[index], scope) : null);
  if (["count", "sum", "avg", "min", "max"].includes(expression.name)) {
    const group = scope.group ?? [scope.row];
    if (expression.name === "count")
      return args.length
        ? group.filter(row => evaluate(args[0], { ...scope, row }) !== null).length
        : group.length;
    const values = group
      .map(row => (args[0] ? evaluate(args[0], { ...scope, row }) : null))
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
    if (!values.length) return null;
    if (expression.name === "sum") return values.reduce((total, value) => total + value, 0);
    if (expression.name === "avg")
      return values.reduce((total, value) => total + value, 0) / values.length;
    return values.reduce((value, item) =>
      expression.name === "min" ? Math.min(value, item) : Math.max(value, item)
    );
  }
  switch (expression.name) {
    case "field":
      return lookup(scope.row, String(get(0)));
    case "hastag": {
      const tag = String(get(0));
      return (
        Array.isArray(scope.row.tags) &&
        scope.row.tags.some(
          value => typeof value === "string" && (value === tag || value.startsWith(tag + "/"))
        )
      );
    }
    case "contains": {
      const value = get(0);
      return Array.isArray(value)
        ? value.includes(get(1))
        : String(value ?? "").includes(String(get(1) ?? ""));
    }
    case "lower":
      return String(get(0) ?? "").toLowerCase();
    case "upper":
      return String(get(0) ?? "").toUpperCase();
    case "length": {
      const value = get(0);
      return Array.isArray(value) || typeof value === "string" ? value.length : 0;
    }
    case "round":
      return Math.round(Number(get(0)));
    case "tonumber": {
      const value = get(0);
      if (value === null || value === "") return null;
      const number = Number(value);
      if (!Number.isFinite(number)) throw new Error("toNumber 无法转换该值");
      return number;
    }
    case "totext":
      return String(get(0) ?? "");
    case "todate": {
      const value = get(0);
      if (value === null) return null;
      const time = typeof value === "number" ? value : Date.parse(String(value));
      if (!Number.isFinite(time)) throw new Error("toDate 无法转换该值");
      return time;
    }
    case "today":
      return scope.context.today;
    case "year":
    case "month": {
      const value = get(0);
      if (value === null) return null;
      if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value))
        return Number(
          value.slice(expression.name === "year" ? 0 : 5, expression.name === "year" ? 4 : 7)
        );
      const date = new Date(typeof value === "number" ? value : String(value));
      if (!Number.isFinite(date.getTime())) throw new Error("日期无效");
      const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: scope.context.timeZone,
        year: "numeric",
        month: "numeric",
      }).formatToParts(date);
      return Number(parts.find(part => part.type === expression.name)?.value);
    }
    case "now":
      return scope.context.now;
    case "coalesce": {
      for (const arg of args) {
        const value = evaluate(arg, scope);
        if (value !== null) return value;
      }
      return null;
    }
    default:
      throw new Error(`未知函数：${expression.name}`);
  }
}

const functionTypes: Record<string, QueryColumnType> = {
  hastag: "boolean",
  contains: "boolean",
  lower: "text",
  upper: "text",
  length: "number",
  round: "number",
  tonumber: "number",
  totext: "text",
  todate: "date",
  today: "date",
  year: "number",
  month: "number",
  now: "date",
  count: "number",
  sum: "number",
  avg: "number",
  min: "number",
  max: "number",
};
export function inferType(
  expression: Expression,
  fields: QueryColumn[],
  types?: WeakMap<Expression, QueryColumnType | undefined>
): QueryColumnType | undefined {
  const type = inferExpressionType(expression, fields, types);
  types?.set(expression, type);
  return type;
}
function inferExpressionType(
  expression: Expression,
  fields: QueryColumn[],
  typeMap?: WeakMap<Expression, QueryColumnType | undefined>
): QueryColumnType | undefined {
  if (expression.kind === "field") {
    if (expression.name.startsWith("params.")) return undefined;
    const field = fields.find(field => field.key === expression.name);
    if (!field) throw new Error(`未知字段：${expression.name}`);
    return field.type;
  }
  if (expression.kind === "literal")
    return expression.value === null
      ? undefined
      : typeof expression.value === "number"
        ? "number"
        : typeof expression.value === "boolean"
          ? "boolean"
          : "text";
  if (expression.kind === "unary") {
    inferType(expression.value, fields, typeMap);
    return ["NOT", "!"].includes(expression.op) ? "boolean" : "number";
  }
  if (expression.kind === "binary") {
    const left = inferType(expression.left, fields, typeMap);
    const right = inferType(expression.right, fields, typeMap);
    return ["+", "-", "*", "/", "%"].includes(expression.op)
      ? expression.op === "+" && (left === "text" || right === "text")
        ? "text"
        : "number"
      : "boolean";
  }
  const types = expression.args.map(arg => inferType(arg, fields, typeMap));
  if (expression.name === "field") {
    const arg = expression.args[0];
    if (arg?.kind !== "literal" || typeof arg.value !== "string")
      throw new Error("field 需要字段 key 字符串");
    const field = fields.find(field => field.key === arg.value);
    if (!field) throw new Error(`未知字段：${arg.value}`);
    return field.type;
  }
  if (expression.name === "coalesce") return types.find(type => type !== undefined);
  if (!Object.hasOwn(functionTypes, expression.name))
    throw new Error(`未知函数：${expression.name}`);
  return functionTypes[expression.name];
}
export function hasAggregate(expression: Expression): boolean {
  return expression.kind === "call"
    ? ["count", "sum", "avg", "min", "max"].includes(expression.name) ||
        expression.args.some(hasAggregate)
    : expression.kind === "binary"
      ? hasAggregate(expression.left) || hasAggregate(expression.right)
      : expression.kind === "unary" && hasAggregate(expression.value);
}
