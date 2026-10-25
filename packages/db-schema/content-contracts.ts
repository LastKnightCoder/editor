export type DataJson =
  | null
  | boolean
  | number
  | string
  | readonly DataJson[]
  | { readonly [key: string]: DataJson };
import { assertContentResourceSpecs, type ContentResourceSpec } from "./content-resources";

export const CONTENT_CONTRACT_VERSION = 2;
export const NODE_CONTRACT_PROPERTY = "tauContract";
export const CONTENT_CONTRACT_LIMITS = Object.freeze({
  contracts: 1024,
  fields: 32,
  nameLength: 128,
  contractBytes: 16 * 1024,
  totalBytes: 1024 * 1024,
});

export interface ContentCollaborationSpec {
  textFields?: readonly string[];
}

export interface ContentContractDefinition {
  type: string;
  dataVersion: number;
  kind: "block" | "inline";
  isVoid?: boolean;
  collaboration?: ContentCollaborationSpec;
  resources?: readonly ContentResourceSpec[];
}

export interface WhiteboardStructure {
  geometry: "rect" | "opaque";
  container: "none" | "free" | "layout";
  canBeContained: boolean;
  joins: readonly "layout"[];
  text: "none" | "plain" | "richtext";
  reference: "none" | "entity";
}

/** 宿主契约输入；结构由宿主注册入口生成，不是新增作者槽位语言。 */
export interface WhiteboardContractDefinition {
  type: string;
  dataVersion: number;
  structure?: Partial<WhiteboardStructure>;
  collaboration?: { textFields?: readonly string[] };
  resources?: readonly ContentResourceSpec[];
}

interface ContractBase {
  format: typeof CONTENT_CONTRACT_VERSION;
  owner: string;
  type: string;
  dataVersion: number;
  textFields: readonly string[];
  structuredFields: readonly string[];
  resources: readonly ContentResourceSpec[];
}

export interface ContentContract extends ContractBase {
  domain: "editor-node";
  kind: "block" | "inline";
  isVoid: boolean;
}

export interface WhiteboardElementContract extends ContractBase {
  domain: "whiteboard-element";
  structure: Readonly<WhiteboardStructure>;
}

export type DataContract = ContentContract | WhiteboardElementContract;
export interface PreparedContentContract {
  id: string;
  contract: ContentContract;
}
export interface PreparedWhiteboardContract {
  id: string;
  contract: WhiteboardElementContract;
}
export type ContentContractDictionary = Readonly<Record<string, DataContract>>;

const RESERVED = new Set([
  "type",
  "children",
  "text",
  "collabId",
  NODE_CONTRACT_PROPERTY,
  "__proto__",
  "constructor",
  "prototype",
]);
const BOARD_RESERVED = new Set(["__proto__", "constructor", "prototype"]);
const FIELD = /^[A-Za-z_$][\w$-]*$/;
const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).length;

function name(value: unknown, label: string): string {
  if (
    typeof value !== "string" ||
    !value ||
    value.length > CONTENT_CONTRACT_LIMITS.nameLength ||
    value.trim() !== value ||
    Array.from(value).some(
      character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127
    )
  )
    throw new Error(`${label}无效`);
  return value;
}

function plain(value: unknown, keys?: readonly string[]): asserts value is Record<string, unknown> {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value)) ||
    Reflect.ownKeys(value).some(
      key => typeof key !== "string" || (keys !== undefined && !keys.includes(key))
    )
  )
    throw new Error("数据契约声明无效");
}

function fields(value: unknown, reserved: ReadonlySet<string>): readonly string[] {
  if (value === undefined) return Object.freeze([]);
  if (!Array.isArray(value) || value.length > CONTENT_CONTRACT_LIMITS.fields)
    throw new Error("协作字段声明无效");
  const result = Array.from(value, entry => {
    const field = name(entry, "协作字段");
    if (!FIELD.test(field) || reserved.has(field))
      throw new Error("协作字段不能占用结构或身份属性");
    return field;
  });
  if (new Set(result).size !== result.length) throw new Error("协作字段重复");
  return Object.freeze(result.sort());
}

function common(
  owner: string,
  definition: ContentContractDefinition | WhiteboardContractDefinition,
  board: boolean
): ContractBase {
  name(owner, "契约归属");
  name(definition.type, "节点类型");
  if (!Number.isSafeInteger(definition.dataVersion) || definition.dataVersion < 1)
    throw new Error("节点数据版本必须为正整数");
  const reserved = board ? BOARD_RESERVED : RESERVED;
  if (definition.collaboration !== undefined) plain(definition.collaboration, ["textFields"]);
  const textFields = fields(definition.collaboration?.textFields, reserved);
  const resources = definition.resources === undefined ? [] : definition.resources;
  assertContentResourceSpecs(resources);
  const paths = new Set<string>();
  for (const spec of resources) {
    plain(spec, ["path", "kind", "preview", "alt", "caption"]);
    for (const key of ["preview", "alt", "caption"] as const)
      if (spec[key] !== undefined) name(spec[key], "资源字段");
    if (paths.has(spec.path)) throw new Error("资源路径重复");
    paths.add(spec.path);
    const top = spec.path.split(".")[0].replace(/\[\]$/, "");
    const addresses = [
      top,
      ...(spec.path.includes(".")
        ? []
        : [spec.preview].filter((field): field is string => !!field)),
    ];
    if (addresses.some(field => textFields.includes(field) || reserved.has(field)))
      throw new Error("资源地址不能与协作字段或结构属性重叠");
  }
  return {
    format: CONTENT_CONTRACT_VERSION,
    owner,
    type: definition.type,
    dataVersion: definition.dataVersion,
    textFields,
    structuredFields: Object.freeze([]),
    resources: Object.freeze(resources.map(resource => Object.freeze({ ...resource }))),
  };
}

function finish<T extends DataContract>(contract: T): T {
  if (bytes(contract) > CONTENT_CONTRACT_LIMITS.contractBytes) throw new Error("单份契约超过预算");
  return Object.freeze(contract);
}

export function normalizeContentContract(
  owner: string,
  definition: ContentContractDefinition
): ContentContract {
  plain(definition, ["type", "dataVersion", "kind", "isVoid", "collaboration", "resources"]);
  if (definition.kind !== "block" && definition.kind !== "inline") throw new Error("节点结构无效");
  if (definition.isVoid !== undefined && typeof definition.isVoid !== "boolean")
    throw new Error("节点 void 声明无效");
  return finish({
    ...common(owner, definition, false),
    domain: "editor-node",
    kind: definition.kind,
    isVoid: definition.isVoid ?? false,
  });
}

export function normalizeWhiteboardContract(
  owner: string,
  definition: WhiteboardContractDefinition
): WhiteboardElementContract {
  plain(definition, ["type", "dataVersion", "structure", "collaboration", "resources"]);
  const input = definition.structure === undefined ? {} : definition.structure;
  plain(input, ["geometry", "container", "canBeContained", "joins", "text", "reference"]);
  const structure: WhiteboardStructure = {
    geometry: input.geometry === undefined ? "rect" : input.geometry,
    container: input.container === undefined ? "none" : input.container,
    canBeContained: input.canBeContained === undefined ? true : input.canBeContained,
    joins: input.joins === undefined ? [] : input.joins,
    text: input.text === undefined ? "none" : input.text,
    reference: input.reference === undefined ? "none" : input.reference,
  };
  if (
    !["rect", "opaque"].includes(structure.geometry) ||
    !["none", "free", "layout"].includes(structure.container) ||
    typeof structure.canBeContained !== "boolean" ||
    !Array.isArray(structure.joins) ||
    structure.joins.length > 1 ||
    Array.from(structure.joins).some(kind => kind !== "layout") ||
    (!structure.canBeContained && structure.joins.length > 0) ||
    !["none", "plain", "richtext"].includes(structure.text) ||
    !["none", "entity"].includes(structure.reference)
  )
    throw new Error("白板结构声明无效");
  structure.joins = Object.freeze([...structure.joins]);
  return finish({
    ...common(owner, definition, true),
    domain: "whiteboard-element",
    structure: Object.freeze(structure),
  });
}

export function canonicalContractJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalContractJson).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.keys(value)
      .sort()
      .filter(key => (value as Record<string, unknown>)[key] !== undefined)
      .map(
        key =>
          `${JSON.stringify(key)}:${canonicalContractJson((value as Record<string, unknown>)[key])}`
      )
      .join(",")}}`;
  return JSON.stringify(value);
}

const verifiedHashes = new Map<string, string>();
let verifiedHashBytes = 0;
function rememberHash(id: string, canonical: string): void {
  const previous = verifiedHashes.get(id);
  if (previous !== undefined) {
    verifiedHashBytes -= previous.length * 2;
    verifiedHashes.delete(id);
  }
  verifiedHashes.set(id, canonical);
  verifiedHashBytes += canonical.length * 2;
  while (verifiedHashBytes > CONTENT_CONTRACT_LIMITS.totalBytes) {
    const oldest = verifiedHashes.keys().next().value!;
    verifiedHashBytes -= verifiedHashes.get(oldest)!.length * 2;
    verifiedHashes.delete(oldest);
  }
}

const preparedContracts = new WeakSet<object>();
export function assertPreparedContract(
  value: PreparedContentContract | PreparedWhiteboardContract
): void {
  if (!preparedContracts.has(value)) throw new Error("契约必须先由公共规范化器准备");
}

async function prepare<T extends DataContract>(contract: T): Promise<{ id: string; contract: T }> {
  const canonical = canonicalContractJson(contract);
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical));
  const id = [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, "0")).join("");
  rememberHash(id, canonical);
  const value = Object.freeze({ id, contract });
  preparedContracts.add(value);
  return value;
}

export async function prepareContentContract(
  owner: string,
  definition: ContentContractDefinition
): Promise<PreparedContentContract> {
  return prepare(normalizeContentContract(owner, definition));
}
export async function prepareWhiteboardContract(
  owner: string,
  definition: WhiteboardContractDefinition
): Promise<PreparedWhiteboardContract> {
  return prepare(normalizeWhiteboardContract(owner, definition));
}

export function contentContractChecks(
  value: unknown
): readonly { id: string; contract: DataContract; canonical: string }[] {
  plain(value);
  const entries = Object.entries(value);
  if (
    entries.length > CONTENT_CONTRACT_LIMITS.contracts ||
    bytes(value) > CONTENT_CONTRACT_LIMITS.totalBytes
  )
    throw new Error("文档契约超过预算");
  const identities = new Set<string>();
  const verified: { id: string; contract: DataContract; canonical: string }[] = [];
  for (const [id, entry] of entries) {
    if (!/^[a-f0-9]{64}$/.test(id)) throw new Error("契约摘要无效");
    plain(entry);
    if (entry.format !== CONTENT_CONTRACT_VERSION) throw new Error("数据契约协议版本不兼容");
    const sharedKeys = [
      "format",
      "domain",
      "owner",
      "type",
      "dataVersion",
      "textFields",
      "structuredFields",
      "resources",
    ];
    let contract: DataContract;
    if (entry.domain === "editor-node") {
      plain(entry, [...sharedKeys, "kind", "isVoid"]);
      contract = normalizeContentContract(entry.owner as string, {
        type: entry.type as string,
        dataVersion: entry.dataVersion as number,
        kind: entry.kind as "block" | "inline",
        isVoid: entry.isVoid as boolean,
        collaboration: {
          textFields: entry.textFields as string[],
        },
        resources: entry.resources as ContentResourceSpec[],
      });
    } else if (entry.domain === "whiteboard-element") {
      plain(entry, [...sharedKeys, "structure"]);
      if (!Array.isArray(entry.structuredFields) || entry.structuredFields.length)
        throw new Error("白板首期不支持结构化字段声明");
      contract = normalizeWhiteboardContract(entry.owner as string, {
        type: entry.type as string,
        dataVersion: entry.dataVersion as number,
        structure: entry.structure as WhiteboardStructure,
        collaboration: { textFields: entry.textFields as string[] },
        resources: entry.resources as ContentResourceSpec[],
      });
    } else throw new Error("数据契约领域无效");
    if (canonicalContractJson(contract) !== canonicalContractJson(entry))
      throw new Error("契约内容与摘要不匹配");
    const identity = JSON.stringify([
      contract.domain,
      contract.owner,
      contract.type,
      contract.dataVersion,
    ]);
    if (identities.has(identity)) throw new Error("同一节点数据版本出现不同契约");
    identities.add(identity);
    verified.push(Object.freeze({ id, contract, canonical: canonicalContractJson(contract) }));
  }
  return Object.freeze(verified);
}

export async function validateContentContracts(value: unknown): Promise<ContentContractDictionary> {
  const verified: Record<string, DataContract> = {};
  for (const entry of contentContractChecks(value)) {
    if (verifiedHashes.get(entry.id) === entry.canonical) rememberHash(entry.id, entry.canonical);
    else {
      const prepared = await prepare(entry.contract);
      if (prepared.id !== entry.id) throw new Error("契约内容与摘要不匹配");
    }
    verified[entry.id] = entry.contract;
  }
  return Object.freeze(verified);
}
