import {
  prepareWhiteboardContract,
  type PreparedWhiteboardContract,
  type WhiteboardElementContract,
  type ContentContractDictionary,
} from "@tau/db-schema/content-contracts";
import type { WhiteboardElementDefinition } from "../extensions/api";
import { assertWhiteboardElementVersions } from "../extensions/versions";
import { assertWhiteboardJson } from "@tau/collaboration";

export interface WhiteboardContractEntry {
  readonly id: string;
  readonly contract: WhiteboardElementContract;
  readonly prepared: PreparedWhiteboardContract;
  readonly element: WhiteboardElementDefinition;
  readonly access: "read" | "edit" | "none";
  readonly current: boolean;
}
function freeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
/** 声明目录不安装文档契约、不运行迁移；已有元素只按精确摘要解析。 */
export class WhiteboardContractCatalog {
  private constructor(
    private readonly entries: ReadonlyMap<string, WhiteboardContractEntry>,
    private readonly active: ReadonlyMap<string, WhiteboardContractEntry>,
    readonly dictionary: ContentContractDictionary
  ) {}
  static async prepare(
    sources: readonly { owner: string; elements: readonly WhiteboardElementDefinition[] }[]
  ): Promise<WhiteboardContractCatalog> {
    const entries = new Map<string, WhiteboardContractEntry>(),
      active = new Map<string, WhiteboardContractEntry>(),
      dictionary: Record<string, WhiteboardElementContract> = {};
    for (const source of sources)
      for (const element of source.elements) {
        assertWhiteboardElementVersions(element);
        if (element.dataVersion === undefined) throw new Error("无版本白板定义不能进入协作目录");
        if (active.has(element.type)) throw new Error("白板类型重复");
        for (const item of [
          { element, access: "edit" as const, current: true },
          ...(element.previousVersions ?? []).map(value => ({ ...value, current: false })),
        ]) {
          const prepared = await prepareWhiteboardContract(source.owner, {
            type: item.element.type,
            dataVersion: item.element.dataVersion!,
            collaboration: item.element.collaboration,
            resources: item.element.resources,
            structure: {
              canBeContained: item.element.containment?.canBeContained,
              joins: item.element.containment?.joins,
            },
          });
          const entry = Object.freeze({ ...item, ...prepared, prepared });
          if (entries.has(entry.id)) throw new Error("白板契约重复");
          entries.set(entry.id, entry);
          dictionary[entry.id] = entry.contract;
          if (item.current) active.set(element.type, entry);
        }
      }
    return new WhiteboardContractCatalog(entries, active, Object.freeze(dictionary));
  }
  get(id: string): WhiteboardContractEntry | undefined {
    return this.entries.get(id);
  }
  current(type: string): WhiteboardContractEntry | undefined {
    return this.active.get(type);
  }
  owns(owner: string, entry: WhiteboardContractEntry): boolean {
    return owner === entry.contract.owner;
  }
  validate(entry: WhiteboardContractEntry, data: unknown): void {
    assertWhiteboardJson(data);
    if (!data || typeof data !== "object" || Array.isArray(data))
      throw new Error("白板载荷必须为对象");
    const schema = entry.element.schema;
    if (!schema) return;
    const result = schema["~standard"].validate(freeze(structuredClone(data)));
    if (result && typeof (result as PromiseLike<unknown>).then === "function") {
      void Promise.resolve(result).catch(() => undefined);
      throw new Error("白板 schema 必须同步校验");
    }
    if ((result as { issues?: readonly unknown[] }).issues?.length)
      throw new Error("白板元素数据不符合声明");
  }
}
