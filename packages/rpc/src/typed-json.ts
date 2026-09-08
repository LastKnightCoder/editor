/**
 * 严格类型 JSON 序列化器。
 *
 * 作用：在 IPC 结构化克隆与 HTTP JSON 传输之间提供语义对等层。
 * - 白名单类型（plain object / array / string / number / boolean / null）直传；
 * - Date / BigInt / Uint8Array(Buffer) / ArrayBuffer / Map / Set / 非有限 number /
 *   容器内的 undefined 编码为 { $__t: ... } 信封，反序列化时还原；
 * - 白名单之外的类型（class 实例、函数、其他 TypedArray 等）序列化时抛错，
 *   在开发期立即暴露，推动修改对应 command 的数据格式而非静默丢数据。
 *
 * 已知与结构化克隆的差异（接受并文档化）：
 * - plain object 属性值为 undefined 时该属性被丢弃（JSON.stringify 语义）；
 * - -0 会被规整为 0。
 */

const ENVELOPE_KEY = "$__t";

type EnvelopeKind = "date" | "bigint" | "bin" | "map" | "set" | "undef" | "num";

const ENVELOPE_KINDS = new Set<string>(["date", "bigint", "bin", "map", "set", "undef", "num"]);

export class TypedJsonError extends Error {
  constructor(
    message: string,
    readonly path: string
  ) {
    super(`${message} (at ${path})`);
    this.name = "TypedJsonError";
  }
}

const BASE64_CHUNK_SIZE = 0x8000;

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += BASE64_CHUNK_SIZE) {
    const chunk = bytes.subarray(i, i + BASE64_CHUNK_SIZE);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function isPlainObject(value: object): boolean {
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/** 判断反序列化过程中的 plain object 是否为本序列化器产生的信封 */
function isEnvelope(value: object): value is Record<string, unknown> {
  if (!isPlainObject(value) || !(ENVELOPE_KEY in value)) {
    return false;
  }
  const kind = value[ENVELOPE_KEY];
  if (typeof kind !== "string" || !ENVELOPE_KINDS.has(kind)) {
    return false;
  }
  const keys = Object.keys(value);
  return keys.every(key => key === ENVELOPE_KEY || key === "v");
}

function typeName(value: unknown): string {
  if (value === null) {
    return "null";
  }
  if (typeof value === "object") {
    const proto = Object.getPrototypeOf(value);
    return proto?.constructor?.name ?? "object";
  }
  return typeof value;
}

function serializeNumber(value: number): unknown {
  if (Number.isFinite(value)) {
    return value;
  }
  if (Number.isNaN(value)) {
    return { $__t: "num", v: "NaN" };
  }
  return { $__t: "num", v: value > 0 ? "+Inf" : "-Inf" };
}

export function serialize(value: unknown, path = "$"): unknown {
  return serializeInner(value, path, new WeakSet());
}

function serializeInner(value: unknown, path: string, seen: WeakSet<object>): unknown {
  if (value === null) {
    return null;
  }
  // 注意：使用内联 typeof 判断以获得类型收窄（中间变量对可变绑定不生效）
  if (typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return serializeNumber(value);
  }
  if (typeof value === "undefined") {
    // 仅在容器（数组/Map/Set）内会被调用；顶层 undefined 由 JSON.stringify 丢弃属性承载
    return { $__t: "undef" };
  }
  if (typeof value === "bigint") {
    return { $__t: "bigint", v: value.toString() };
  }
  if (typeof value === "function" || typeof value === "symbol") {
    throw new TypedJsonError(
      `无法序列化${typeof value === "function" ? "函数" : "symbol"}，请调整该数据格式`,
      path
    );
  }

  // typeof === "object"
  if (seen.has(value)) {
    throw new TypedJsonError("检测到循环引用，无法序列化", path);
  }
  seen.add(value);
  try {
    return serializeObject(value, path, seen);
  } finally {
    // 仅检测当前 DFS 路径上的环，同一对象被多处共享（DAG）不误报
    seen.delete(value);
  }
}

function serializeObject(value: object, path: string, seen: WeakSet<object>): unknown {
  if (value instanceof Date) {
    if (isNaN(value.getTime())) {
      throw new TypedJsonError("无法序列化 Invalid Date", path);
    }
    return { $__t: "date", v: value.toISOString() };
  }
  if (value instanceof Uint8Array) {
    // Buffer 是 Uint8Array 的子类，一并覆盖
    return { $__t: "bin", v: bytesToBase64(value) };
  }
  if (value instanceof ArrayBuffer) {
    return { $__t: "bin", v: bytesToBase64(new Uint8Array(value)) };
  }
  if (value instanceof Map) {
    const entries: unknown[] = [];
    let index = 0;
    for (const [key, item] of value) {
      entries.push([
        serializeInner(key, `${path}.key[${index}]`, seen),
        serializeInner(item, `${path}.value[${index}]`, seen),
      ]);
      index++;
    }
    return { $__t: "map", v: entries };
  }
  if (value instanceof Set) {
    const items: unknown[] = [];
    let index = 0;
    for (const item of value) {
      items.push(serializeInner(item, `${path}.item[${index}]`, seen));
      index++;
    }
    return { $__t: "set", v: items };
  }
  if (Array.isArray(value)) {
    return value.map((item, index) => serializeInner(item, `${path}[${index}]`, seen));
  }
  if (isPlainObject(value)) {
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      // 属性值为 undefined 时丢弃该属性（JSON.stringify 语义），无需信封
      if (item !== undefined) {
        result[key] = serializeInner(item, `${path}.${key}`, seen);
      }
    }
    return result;
  }

  throw new TypedJsonError(
    `无法序列化类型 ${typeName(value)}，请将其转换为协议白名单内的数据格式`,
    path
  );
}

function deserializeEnvelope(kind: EnvelopeKind, raw: unknown): unknown {
  switch (kind) {
    case "date":
      return new Date(raw as string);
    case "bigint":
      return BigInt(raw as string);
    case "bin":
      return base64ToBytes(raw as string);
    case "map":
      return new Map(
        (raw as [unknown, unknown][]).map(
          ([key, value]) => [deserialize(key), deserialize(value)] as const
        )
      );
    case "set":
      return new Set((raw as unknown[]).map(item => deserialize(item)));
    case "undef":
      return undefined;
    case "num":
      if (raw === "NaN") {
        return NaN;
      }
      return raw === "+Inf" ? Infinity : -Infinity;
  }
}

export function deserialize(value: unknown): unknown {
  if (value === null || typeof value !== "object") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(item => deserialize(item));
  }

  if (isEnvelope(value)) {
    return deserializeEnvelope(value[ENVELOPE_KEY] as EnvelopeKind, value.v);
  }

  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    result[key] = deserialize(item);
  }
  return result;
}

/** 序列化并 JSON.stringify，产出可直接作为 HTTP body 的字符串 */
export function stringifyTyped(value: unknown): string {
  return JSON.stringify(serialize(value));
}

/** JSON.parse 后反序列化，还原真实类型 */
export function parseTyped(text: string): unknown {
  return deserialize(JSON.parse(text));
}
