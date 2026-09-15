/**
 * 参数 schema DSL —— 编译期类型推导 + 运行时净化（从移动端 router/core/paramsSchema.ts 移植的最小核心）。
 *
 * 用法：
 *   const schema = createSurfaceSchema({ cardId: paramNumber(), keyword: paramOptional(paramString()) });
 *   type Params = typeof schema.type;        // { cardId: number; keyword?: string }
 *   sanitizeParams(schema.schema, raw);      // 会话恢复/外部输入净化：丢弃未知键、类型回退、必填缺失拒绝
 */

export interface ParamDesc<T> {
  readonly kind: "number" | "string" | "boolean";
  readonly optional: boolean;
  readonly defaultValue?: T;
}

export type ParamFields = Record<string, ParamDesc<unknown>>;

type InferDesc<D extends ParamDesc<unknown>> = D extends ParamDesc<infer T> ? T : never;

export type InferFields<F extends ParamFields> = {
  [K in keyof F as F[K] extends { optional: true } ? never : K]: InferDesc<F[K]>;
} & {
  [K in keyof F as F[K] extends { optional: true } ? K : never]?: InferDesc<F[K]>;
};

export function paramString(): ParamDesc<string> {
  return { kind: "string", optional: false };
}
export function paramNumber(): ParamDesc<number> {
  return { kind: "number", optional: false };
}
export function paramBoolean(): ParamDesc<boolean> {
  return { kind: "boolean", optional: false };
}
export function paramOptional<T>(desc: ParamDesc<T>, defaultValue?: T): ParamDesc<T> {
  return { ...desc, optional: true, defaultValue };
}

export interface SurfaceSchema<F extends ParamFields> {
  readonly schema: F;
  /** 仅用于类型推导，禁止运行时访问 */
  readonly type: InferFields<F>;
}

export function createSurfaceSchema<F extends ParamFields>(schema: F): SurfaceSchema<F> {
  return {
    schema,
    get type(): InferFields<F> {
      throw new Error("createSurfaceSchema().type 仅用于类型推导，不可运行时访问");
    },
  };
}

/** 运行时净化：外部输入（会话恢复/深链）→ schema 允许的安全参数；必填缺失返回 null。 */
export function sanitizeParams(
  fields: ParamFields,
  raw: Record<string, unknown> | undefined
): Record<string, unknown> | null {
  const out: Record<string, unknown> = {};
  for (const [key, desc] of Object.entries(fields)) {
    const value = raw?.[key];
    if (value === undefined || value === null) {
      if (desc.optional) {
        if (desc.defaultValue !== undefined) out[key] = desc.defaultValue;
        continue;
      }
      return null; // 必填缺失，整体拒绝
    }
    switch (desc.kind) {
      case "number":
        if (typeof value === "number" && Number.isFinite(value)) out[key] = value;
        else if (
          typeof value === "string" &&
          value.trim() !== "" &&
          Number.isFinite(Number(value))
        ) {
          out[key] = Number(value);
        } else return null;
        break;
      case "boolean":
        if (typeof value === "boolean") out[key] = value;
        else return null;
        break;
      case "string":
      default:
        if (typeof value === "string") out[key] = value;
        else return null;
        break;
    }
  }
  return out;
}
