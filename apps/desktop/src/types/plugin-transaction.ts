/** 插件原子提交（context.transaction）的 IPC 契约：实体与关联来源为数字 ID，其余同 SDK。 */
import type { PluginEntityRef, PluginRecordData } from "@tau/plugins";
import type { PluginIndexes } from "@tau/plugins/query";
import type { PluginEntityCreate, PluginEntityPatch } from "./plugin-entities";

export type PluginTransactionCommitOp =
  | { op: "entity.create"; id: number; input: PluginEntityCreate }
  | {
      op: "entity.update";
      id: number;
      patch: PluginEntityPatch;
      expectedRevision?: string;
      indexes: Record<string, PluginIndexes>;
    }
  | { op: "entity.delete"; id: number; expectedRevision?: string }
  | {
      op: "record.insert";
      collection: string;
      id: string;
      data: PluginRecordData;
      indexes: PluginIndexes;
    }
  | {
      op: "record.update";
      collection: string;
      id: string;
      data: PluginRecordData;
      expectedRevision?: string;
      indexes: PluginIndexes;
    }
  | { op: "record.delete"; collection: string; id: string; expectedRevision?: string }
  | {
      op: "link.add";
      id: string;
      from: number;
      to: PluginEntityRef;
      role: string;
      data: Record<string, unknown>;
      readable: boolean;
    }
  | { op: "link.remove"; id: string }
  | { op: "link.reorder"; from: number; ids: string[] };
