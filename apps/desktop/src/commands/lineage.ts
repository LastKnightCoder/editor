import { invoke } from "@/electron";
import type {
  LineageNode,
  LineageNodeKind,
  LineageRecord,
  LineageRelation,
} from "@/entity/lineage";

/** 记一条谱系；幂等。谱系是附加信息，写失败只记日志，不影响调用方已完成的主操作 */
export const recordLineage = async (record: LineageRecord): Promise<void> => {
  try {
    await invoke("lineage:record", record);
  } catch (error) {
    console.error("[lineage] 记录谱系失败", record, error);
  }
};

export const findLineageDst = async (
  src: LineageNode,
  relation: LineageRelation,
  dstKind?: LineageNodeKind
): Promise<LineageNode[]> => {
  return await invoke("lineage:find-dst", src, relation, dstKind);
};

/** 网页条目已保存的剪藏解析文档 id */
export const findClippedWebClipId = async (projectItemId: number): Promise<number | null> => {
  const [clip] = await findLineageDst(
    { kind: "project-item", id: projectItemId },
    "clipped_from",
    "web-clip"
  );
  return clip?.kind === "web-clip" ? clip.id : null;
};

/** 网页条目 → 解析文档的归属：加载解析结果依赖它，写失败要抛给调用方 */
export const recordWebClip = async (projectItemId: number, webClipId: number): Promise<void> => {
  const record: LineageRecord = {
    src: { kind: "project-item", id: projectItemId },
    dst: { kind: "web-clip", id: webClipId },
    relation: "clipped_from",
  };
  await invoke("lineage:record", record);
};
