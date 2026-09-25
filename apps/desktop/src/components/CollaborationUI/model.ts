/**
 * 协作展示层纯函数：成员活动、在线摘要、申请筛选、退出意图。
 * 协作页与内容页的分享对话框共用；会话状态文案见 @tau/collaboration/src/view 的 sessionStatus。
 */

import type { CollaborationSession, JoinRequest, Member, SourceType } from "@tau/collaboration";

export type MemberActivity = Member["activity"] | "offline";

/** IPC / 网络失败的可展示文案，非 Error 时用兜底 */
export const errorText = (error: unknown, fallback = "操作失败") =>
  error instanceof Error ? error.message : fallback;

export const memberActivityKey = (member: Member): MemberActivity =>
  member.online ? member.activity : "offline";

export function memberActivity(member: Member): string {
  if (!member.online) return "离线";
  if (member.activity === "editing") return "正在编辑";
  if (member.activity === "viewing") return "正在查看";
  return "后台";
}

/** 在线摘要只数他人：自己在编辑不必告诉自己 */
export function othersSummary(session: CollaborationSession, deviceId?: string): string {
  const others = session.members.filter(member => member.deviceId !== deviceId && member.online);
  const editing = others.filter(member => member.activity === "editing").length;
  if (editing) return `${editing} 人正在编辑`;
  if (others.length) return `${others.length} 人在线`;
  return "只有你在";
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
  /** discard = discardLocalCollaboration；leave = leaveCollaboration(id, pending) */
  action: "discard" | "leave";
  title: string;
  description: string;
  confirmText: string;
  /** 作者仍有未同步改动：必须等同步完成才能结束共享 */
  blocked: boolean;
}

export function leaveIntent(session: CollaborationSession): LeaveIntent {
  const owner = session.role === "owner";
  if (isStale(session)) {
    return {
      action: "discard",
      title: "清理本地协作记录？",
      description:
        "协作服务当前不可达。缓存内容会先保留到本地，然后删除本机的共享记录；原内容不会删除。",
      confirmText: "清理记录",
      blocked: false,
    };
  }
  if (session.status === "closed") {
    return {
      action: "leave",
      title: "清理协作缓存？",
      description: "共享已结束，清理后本机不再保留这份协作缓存。",
      confirmText: "清理",
      blocked: false,
    };
  }
  if (session.pending) {
    return owner
      ? {
          action: "leave",
          title: "结束共享？",
          description: "还有未同步的改动，同步完成后才能结束共享。",
          confirmText: "结束共享",
          blocked: true,
        }
      : {
          action: "leave",
          title: "退出协作？",
          description: "还有未同步的改动。等待同步完成后再退出，或丢弃这些改动。",
          confirmText: "丢弃改动并退出",
          blocked: false,
        };
  }
  return owner
    ? {
        action: "leave",
        title: "结束共享？",
        description: "所有成员将停止协作，服务器上的正文与附件会被清理，原内容保留在本机。",
        confirmText: "结束共享",
        blocked: false,
      }
    : {
        action: "leave",
        title: "退出协作？",
        description: "这份内容将从协作中移除，已保存的本地内容不受影响。",
        confirmText: "退出",
        blocked: false,
      };
}

export function leaveLabel(session: CollaborationSession): string {
  if (isStale(session)) return "清理本地记录";
  if (session.status === "closed") return "清理协作缓存";
  return session.role === "owner" ? "结束共享" : "退出协作";
}

export const SOURCE_LABELS: Record<SourceType, string> = {
  article: "文章",
  card: "卡片",
  "project-item": "项目文档",
  content: "内容",
};

/** 剩余天数（不足一天按一天） */
export function daysLeft(expiresAt: number, now = Date.now()): number {
  return Math.max(1, Math.ceil((expiresAt - now) / 86_400_000));
}

/** 12 位协作码按 4 位分段展示与复制（服务端比对时忽略空白与短横） */
export function formatInvitationCode(code: string): string {
  return code.replace(/[\s-]/g, "").replace(/(.{4})(?=.)/g, "$1-");
}
