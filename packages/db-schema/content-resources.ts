// 正文节点的资源声明：节点里哪些字段是图片、视频、音频或文件。
// 导出打包、协作上传、灯箱、EPUB 与 CLI 只按声明找资源，不按字段名推断。

export type ContentResourceKind = "image" | "video" | "audio" | "file";
export const CONTENT_RESOURCE_KINDS: readonly ContentResourceKind[] = [
  "image",
  "video",
  "audio",
  "file",
];

export interface ContentResourceSpec {
  /** 字段路径：`url`、`images[].url`；`[]` 表示数组的每一项 */
  path: string;
  kind: ContentResourceKind;
  /** 同一资源的显示版本（如裁剪结果），与 path 末段同层的字段名，同样参与上传与改写 */
  preview?: string;
  /** 替代文字字段，与 path 末段同层 */
  alt?: string;
  /** 说明文字字段，与 path 末段同层 */
  caption?: string;
}

/** 节点类型 → 资源字段 */
export type ContentResourceDeclarations = Readonly<Record<string, readonly ContentResourceSpec[]>>;

/** 宿主内置节点的资源字段 */
export const BUILTIN_CONTENT_RESOURCES = {
  image: [
    { path: "url", kind: "image", preview: "previewUrl", alt: "alt", caption: "description" },
  ],
  "inline-image": [{ path: "url", kind: "image", alt: "alt" }],
  audio: [{ path: "src", kind: "audio" }],
  video: [{ path: "src", kind: "video" }],
  "file-attachment": [
    { path: "filePath", kind: "file" },
    { path: "localFilePath", kind: "file" },
  ],
} as const satisfies ContentResourceDeclarations;

const UNSAFE_SEGMENTS = new Set(["__proto__", "constructor", "prototype"]);
const SEGMENT = /^[A-Za-z_$][\w$-]*(\[\])?$/;
const FIELD = /^[A-Za-z_$][\w$-]*$/;
const MAX_SPECS = 16;
const MAX_PATH_LENGTH = 128;

interface Segment {
  key: string;
  each: boolean;
}

const parsedPaths = new Map<string, Segment[]>();
function parsePath(path: string): Segment[] {
  let parsed = parsedPaths.get(path);
  if (!parsed) {
    parsed = path.split(".").map(part => {
      const each = part.endsWith("[]");
      return { key: each ? part.slice(0, -2) : part, each };
    });
    parsedPaths.set(path, parsed);
  }
  return parsed;
}

const isField = (value: unknown): value is string =>
  typeof value === "string" && FIELD.test(value) && !UNSAFE_SEGMENTS.has(value);

function isValidPath(path: unknown): path is string {
  if (typeof path !== "string" || !path || path.length > MAX_PATH_LENGTH) return false;
  const parts = path.split(".");
  // 末段是资源字段本身，不能是数组
  return parts.every(
    (part, index) =>
      SEGMENT.test(part) &&
      !UNSAFE_SEGMENTS.has(part.replace(/\[\]$/, "")) &&
      (index < parts.length - 1 || !part.endsWith("[]"))
  );
}

export function isContentResourceSpec(value: unknown): value is ContentResourceSpec {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const spec = value as Record<string, unknown>;
  return (
    isValidPath(spec.path) &&
    CONTENT_RESOURCE_KINDS.includes(spec.kind as ContentResourceKind) &&
    ["preview", "alt", "caption"].every(key => spec[key] === undefined || isField(spec[key])) &&
    Object.keys(spec).every(key => ["path", "kind", "preview", "alt", "caption"].includes(key))
  );
}

/** 校验来自插件或其他设备的声明；形状不对时抛错 */
export function assertContentResourceSpecs(
  value: unknown
): asserts value is readonly ContentResourceSpec[] {
  if (!Array.isArray(value) || value.length > MAX_SPECS || !value.every(isContentResourceSpec))
    throw new Error("资源声明无效");
}

/** 合并多份声明，后者覆盖同类型的前者 */
export function mergeContentResources(
  ...sources: readonly ContentResourceDeclarations[]
): ContentResourceDeclarations {
  return Object.freeze(Object.assign({}, ...sources));
}

/** 资源所在的对象（字段的父对象）及字段名 */
export interface ContentResourceSlot {
  spec: ContentResourceSpec;
  owner: Record<string, unknown>;
  field: string;
}

/** 按声明列出一个节点里的资源位置（不深入子节点） */
export function contentResourceSlots(
  node: unknown,
  specs: readonly ContentResourceSpec[] | undefined
): ContentResourceSlot[] {
  if (!specs?.length || !node || typeof node !== "object") return [];
  const slots: ContentResourceSlot[] = [];
  for (const spec of specs) {
    const segments = parsePath(spec.path);
    const walk = (value: unknown, index: number) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) return;
      const owner = value as Record<string, unknown>;
      const { key, each } = segments[index];
      if (index === segments.length - 1) {
        slots.push({ spec, owner, field: key });
        return;
      }
      const next = owner[key];
      if (each) {
        if (Array.isArray(next)) for (const item of next) walk(item, index + 1);
      } else walk(next, index + 1);
    };
    walk(node, 0);
  }
  return slots;
}

/** 资源位置上实际的地址：主地址与显示版本，空串跳过 */
export function contentResourceValues(slot: ContentResourceSlot): string[] {
  const values = [slot.owner[slot.field]];
  if (slot.spec.preview) values.push(slot.owner[slot.spec.preview]);
  return values.filter((value): value is string => typeof value === "string" && value !== "");
}

export interface ContentResourceEntry {
  node: Record<string, unknown>;
  slot: ContentResourceSlot;
}

/** 按文档顺序遍历节点树里所有声明了资源的位置 */
export function forEachContentResource(
  nodes: readonly unknown[],
  declarations: ContentResourceDeclarations,
  visit: (entry: ContentResourceEntry) => void
) {
  const walk = (value: unknown) => {
    if (!value || typeof value !== "object") return;
    const node = value as Record<string, unknown>;
    const specs = typeof node.type === "string" ? declarations[node.type] : undefined;
    for (const slot of contentResourceSlots(node, specs)) visit({ node, slot });
    if (Array.isArray(node.children)) for (const child of node.children) walk(child);
  };
  for (const node of nodes) walk(node);
}

/** 收集节点树里的资源地址（去重，保持首次出现的顺序） */
export function collectContentResources(
  nodes: readonly unknown[],
  declarations: ContentResourceDeclarations
): { url: string; kind: ContentResourceKind }[] {
  const seen = new Set<string>();
  const result: { url: string; kind: ContentResourceKind }[] = [];
  forEachContentResource(nodes, declarations, ({ slot }) => {
    for (const url of contentResourceValues(slot)) {
      if (seen.has(url)) continue;
      seen.add(url);
      result.push({ url, kind: slot.spec.kind });
    }
  });
  return result;
}

export type ContentResourceMapper = (url: string, kind: ContentResourceKind) => string | undefined;

/** 不可变地改写一个节点里声明的资源（不深入子节点）；返回 undefined 表示保留原值 */
export function mapNodeResources<T>(
  node: T,
  specs: readonly ContentResourceSpec[] | undefined,
  mapper: ContentResourceMapper
): T {
  if (!specs?.length || !node || typeof node !== "object") return node;
  let result = node as unknown as Record<string, unknown>;
  for (const spec of specs) {
    const fields = [parsePath(spec.path).at(-1)!.key, ...(spec.preview ? [spec.preview] : [])];
    result = mapAt(result, parsePath(spec.path), 0, owner => {
      let next = owner;
      for (const field of fields) {
        const value = owner[field];
        if (typeof value !== "string" || !value) continue;
        const mapped = mapper(value, spec.kind);
        if (mapped === undefined || mapped === value) continue;
        if (next === owner) next = { ...owner };
        next[field] = mapped;
      }
      return next;
    }) as Record<string, unknown>;
  }
  return result as unknown as T;
}

function mapAt(
  value: unknown,
  segments: Segment[],
  index: number,
  update: (owner: Record<string, unknown>) => Record<string, unknown>
): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const owner = value as Record<string, unknown>;
  if (index === segments.length - 1) return update(owner);
  const { key, each } = segments[index];
  const current = owner[key];
  let next: unknown;
  if (each) {
    if (!Array.isArray(current)) return owner;
    const items = current.map(item => mapAt(item, segments, index + 1, update));
    next = items.some((item, position) => item !== current[position]) ? items : current;
  } else next = mapAt(current, segments, index + 1, update);
  return next === current ? owner : { ...owner, [key]: next };
}

/** 不可变地改写整棵节点树里声明的资源 */
export function mapContentResources<T>(
  nodes: readonly T[],
  declarations: ContentResourceDeclarations,
  mapper: ContentResourceMapper
): T[] {
  const mapNode = (value: unknown): unknown => {
    if (!value || typeof value !== "object") return value;
    let node = value as Record<string, unknown>;
    const specs = typeof node.type === "string" ? declarations[node.type] : undefined;
    node = mapNodeResources(node, specs, mapper);
    const children = node.children;
    if (Array.isArray(children)) {
      const next = children.map(mapNode);
      if (next.some((child, index) => child !== children[index]))
        node = { ...node, children: next };
    }
    return node;
  };
  return nodes.map(node => mapNode(node) as T);
}
