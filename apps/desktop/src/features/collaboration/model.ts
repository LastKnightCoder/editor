/**
 * 协作页域模型（纯函数）：侧栏子项与协作页共用同一排序与选中规则，保证两处指向同一份内容。
 */

import type { CollaborationSession, SharedWhiteboardInfo, SourceBinding } from "@tau/collaboration";
import { SOURCE_LABELS } from "@/components/CollaborationUI/model";

export interface SharedGroup {
  label: string;
  sessions: CollaborationSession[];
  whiteboards: SharedWhiteboardInfo[];
}

/** 侧栏分组：我发起的在前、我加入的在后，白板排在同组正文之后；组内保持主进程顺序，空组不出现。 */
export function groupShared(
  sessions: CollaborationSession[],
  whiteboards: SharedWhiteboardInfo[]
): SharedGroup[] {
  const mine = (role: string) => role === "owner";
  return [
    {
      label: "我发起的",
      sessions: sessions.filter(session => mine(session.role)),
      whiteboards: whiteboards.filter(room => mine(room.role)),
    },
    {
      label: "我加入的",
      sessions: sessions.filter(session => !mine(session.role)),
      whiteboards: whiteboards.filter(room => !mine(room.role)),
    },
  ].filter(group => group.sessions.length + group.whiteboards.length > 0);
}

/** 协作页当前内容：正文在页内编辑，白板在页内展示协作信息。 */
export type SharedSelection =
  | { kind: "session"; id: string; session: CollaborationSession }
  | { kind: "whiteboard"; id: string; room: SharedWhiteboardInfo };

/** 页面参数里的 id 失效（已退出 / 被移除）或缺省时，落到侧栏第一项 */
export function resolveShared(
  sessions: CollaborationSession[],
  whiteboards: SharedWhiteboardInfo[],
  id: string | undefined
): SharedSelection | undefined {
  const items = groupShared(sessions, whiteboards).flatMap((group): SharedSelection[] => [
    ...group.sessions.map(session => ({ kind: "session" as const, id: session.id, session })),
    ...group.whiteboards.map(room => ({ kind: "whiteboard" as const, id: room.id, room })),
  ]);
  return items.find(item => item.id === id) ?? items[0];
}

export interface SourceInfo {
  /** 来源类型文案（文章 / 卡片 / 项目文档 / 内容） */
  typeLabel: string;
  title?: string;
  source?: SourceBinding;
}

/** 我发起的有本机原内容；我加入的只有协作缓存，来源显示为「某某的共享」 */
export function sourceInfo(session: CollaborationSession): SourceInfo {
  const source = session.source;
  if (source) {
    return {
      typeLabel: SOURCE_LABELS[source.sourceType ?? "content"],
      title: source.sourceTitle,
      source,
    };
  }
  const owner = session.members.find(member => member.role === "owner");
  return { typeLabel: owner ? `${owner.nickname} 的共享` : "他人的共享" };
}

/** 能跳回原内容页的来源（日记等无详情页的内容类型不提供入口） */
export function openableSource(session: CollaborationSession): SourceBinding | undefined {
  const source = session.source;
  if (!source?.sourceId) return undefined;
  return source.sourceType === "article" ||
    source.sourceType === "card" ||
    source.sourceType === "project-item"
    ? source
    : undefined;
}
