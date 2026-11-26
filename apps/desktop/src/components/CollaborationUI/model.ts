/**
 * 协作展示层纯函数：成员活动、在线摘要、申请筛选、退出意图。
 * 协作页与内容页的分享对话框共用；会话状态文案见 @tau/collaboration/src/view 的 sessionStatus。
 */

import type { CollaborationSession, JoinRequest, Member } from "@tau/collaboration";
import type { CollaborationUiLocale } from "./i18n";
import type { RoomLocale } from "./room.i18n";

export type MemberActivity = Member["activity"] | "offline";

export const memberActivityKey = (member: Pick<Member, "online" | "activity">): MemberActivity =>
  member.online ? member.activity : "offline";

export function memberActivity(
  member: Pick<Member, "online" | "activity">,
  { t }: RoomLocale
): string {
  return t(`activity.${memberActivityKey(member)}`);
}

/** 在线摘要只数他人：自己在编辑不必告诉自己 */
export function othersSummary(
  session: CollaborationSession,
  deviceId: string | undefined,
  { locale, t }: CollaborationUiLocale
): string {
  const others = session.members.filter(member => member.deviceId !== deviceId && member.online);
  const editing = others.filter(member => member.activity === "editing").length;
  if (editing)
    return t("others.editing", { count: editing, amount: editing.toLocaleString(locale) });
  if (others.length)
    return t("others.online", {
      count: others.length,
      amount: others.length.toLocaleString(locale),
    });
  return t("others.alone");
}

/** 作者在前；其余在线优先，编辑中优先 */
export function sortMembers(members: Member[]): Member[] {
  const rank = (member: Member) =>
    member.role === "owner" ? 0 : !member.online ? 3 : member.activity === "editing" ? 1 : 2;
  return [...members].sort((a, b) => rank(a) - rank(b));
}

export function pendingRequests(requests: JoinRequest[], documentId?: string): JoinRequest[] {
  return requests.filter(
    request => request.status === "pending" && (!documentId || request.documentId === documentId)
  );
}

/** 连接已不可用：退出改走「清理本地记录」（缓存先保留到本地再删除共享记录） */
export function isStale(session: CollaborationSession): boolean {
  return (
    session.leaving ||
    session.connection === "offline" ||
    session.connection === "error" ||
    Boolean(session.error)
  );
}

export interface LeaveIntent {
  kind: "discard" | "closed" | "owner-pending" | "member-pending" | "owner" | "member";
  /** discard = discardLocalCollaboration；leave = leaveCollaboration(id, pending) */
  action: "discard" | "leave";
  /** 作者仍有未同步改动：必须等同步完成才能结束共享 */
  blocked: boolean;
}

export function leaveIntent(session: CollaborationSession): LeaveIntent {
  const owner = session.role === "owner";
  if (isStale(session)) return { kind: "discard", action: "discard", blocked: false };
  if (session.status === "closed") return { kind: "closed", action: "leave", blocked: false };
  if (session.pending)
    return { kind: owner ? "owner-pending" : "member-pending", action: "leave", blocked: owner };
  return { kind: owner ? "owner" : "member", action: "leave", blocked: false };
}

export function leaveLabel(session: CollaborationSession, { t }: RoomLocale): string {
  return t(`leave.${leaveIntent(session).kind}.label`);
}

/** 剩余天数（不足一天按一天） */
export function daysLeft(expiresAt: number, now = Date.now()): number {
  return Math.max(1, Math.ceil((expiresAt - now) / 86_400_000));
}

/** 12 位协作码按 4 位分段展示与复制（服务端比对时忽略空白与短横） */
export function formatInvitationCode(code: string): string {
  return code.replace(/[\s-]/g, "").replace(/(.{4})(?=.)/g, "$1-");
}
