// 页面参数 Schema：轻量 DSL，同时提供编译期类型推导与运行时净化。
// params 必须可 JSON 序列化（要进 history 快照），因此描述子仅覆盖标量与嵌套对象。

export interface NumberDesc {
  readonly kind: "number";
  readonly default?: number;
}
export interface StringDesc {
  readonly kind: "string";
  readonly default?: string;
}
export interface BooleanDesc {
  readonly kind: "boolean";
  readonly default?: boolean;
}
export interface EnumDesc<V extends readonly (string | number)[]> {
  readonly kind: "enum";
  readonly values: V;
  readonly default?: V[number];
}
export interface OptionalDesc<I extends ParamDesc> {
  readonly kind: "optional";
  readonly inner: I;
}
export interface ObjectDesc<F extends ParamFields> {
  readonly kind: "object";
  readonly fields: F;
  readonly default?: unknown;
}

export type ParamDesc =
  | NumberDesc
  | StringDesc
  | BooleanDesc
  | EnumDesc<readonly (string | number)[]>
  | OptionalDesc<ParamDesc>
  | ObjectDesc<ParamFields>;

export type ParamFields = { readonly [field: string]: ParamDesc };

export function number(defaultValue?: number): NumberDesc {
  return typeof defaultValue === "number"
    ? { kind: "number", default: defaultValue }
    : { kind: "number" };
}

export function string(defaultValue?: string): StringDesc {
  return typeof defaultValue === "string"
    ? { kind: "string", default: defaultValue }
    : { kind: "string" };
}

export function boolean(defaultValue?: boolean): BooleanDesc {
  return typeof defaultValue === "boolean"
    ? { kind: "boolean", default: defaultValue }
    : { kind: "boolean" };
}

export function oneOf<const V extends readonly (string | number)[]>(...values: V): EnumDesc<V> {
  return { kind: "enum", values };
}

export function optional<I extends ParamDesc>(inner: I): OptionalDesc<I> {
  return { kind: "optional", inner };
}

export function object<F extends ParamFields>(fields: F): ObjectDesc<F> {
  return { kind: "object", fields };
}

// ============ 类型推导 ============

export type InferDesc<D extends ParamDesc> = D extends NumberDesc
  ? number
  : D extends StringDesc
    ? string
    : D extends BooleanDesc
      ? boolean
      : D extends EnumDesc<infer V>
        ? V[number]
        : D extends OptionalDesc<infer I>
          ? InferDesc<I> | undefined
          : D extends ObjectDesc<infer F>
            ? InferFields<F>
            : never;

export type InferFields<F extends ParamFields> = {
  [K in keyof F as F[K] extends OptionalDesc<any> ? never : K]: InferDesc<F[K]>;
} & {
  [K in keyof F as F[K] extends OptionalDesc<any> ? K : never]?: InferDesc<F[K]>;
};

// ============ 运行时净化 ============

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function sanitizeDesc(desc: ParamDesc, value: unknown): unknown {
  if (desc.kind === "optional") {
    if (value === undefined) return undefined;
    return sanitizeDesc(desc.inner, value);
  }
  if (desc.kind === "object") {
    if (value === undefined) return undefined;
    if (!isPlainObject(value)) return undefined;
    return sanitizeFields(desc.fields, value);
  }
  if (value === undefined) {
    return "default" in desc ? desc.default : undefined;
  }
  switch (desc.kind) {
    case "number":
      return typeof value === "number" && Number.isFinite(value) ? value : desc.default;
    case "string":
      return typeof value === "string" ? value : desc.default;
    case "boolean":
      return typeof value === "boolean" ? value : desc.default;
    case "enum":
      return (desc.values as readonly unknown[]).includes(value) ? value : desc.default;
    default:
      return undefined;
  }
}

function isRequired(desc: ParamDesc): boolean {
  return desc.kind !== "optional" && !("default" in desc && desc.default !== undefined);
}

/**
 * 净化外部输入（history 快照、深链接）：
 * - 丢弃 schema 之外的字段；
 * - 类型不符的值回退到描述子 default，无 default 的必填字段非法则整体拒绝。
 * 运行时路径不做类型推导（避免无界递归），泛型推导由 InferFields 单独承担。
 */
export function sanitizeParams(fields: ParamFields, raw: unknown): Record<string, unknown> | null {
  if (!isPlainObject(raw)) return null;
  return sanitizeFields(fields, raw);
}

function sanitizeFields(
  fields: ParamFields,
  raw: Record<string, unknown>
): Record<string, unknown> | null {
  const result: Record<string, unknown> = {};
  for (const [field, desc] of Object.entries(fields)) {
    const sanitized = sanitizeDesc(desc, raw[field]);
    if (sanitized === undefined && isRequired(desc)) {
      return null;
    }
    if (sanitized !== undefined) {
      result[field] = sanitized;
    }
  }
  return result;
}

/**
 * 页面文件内的 schema 绑定：schema 与参数类型的单一事实源。
 * 用法：
 *   const s = createPageSchema({ todoId: paramNumber() });
 *   type Params = typeof s.type;           // 编译期推导
 *   usePage<Params>() / definePage({ params: s.schema })
 */
export function createPageSchema<F extends ParamFields>(schema: F) {
  return {
    schema,
    get type(): InferFields<F> {
      throw new Error("createPageSchema().type 仅用于类型推导，不可运行时访问");
    },
  };
}
