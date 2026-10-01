/**
 * 协作副本（方案 A3）：直接编辑共享内容——我发起的与我加入的都在这里改。
 * 落在协作页那张纸内，不自带卡片外壳；顶栏 / 横幅 / 底栏与页头同为 32px 左右边距。
 *
 * 顶栏：来源 · 在线成员（Popover：协作码 / 待审批 / 成员）· 协作码 chip（点击复制）·
 * 在原内容中打开 · 更多（复制 / 轮换协作码、结束共享 / 退出 / 清理）。
 * 顶部内联：连接异常横幅 + 本条内容的加入申请（就地同意 / 拒绝）。
 * 正文与标题共用同一个会话绑定；共享已结束或冻结时只读。
 */

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Copy,
  ExternalLink,
  FileText,
  FolderKanban,
  KeyRound,
  Layers,
  LogOut,
  MoreHorizontal,
  RefreshCw,
  Trash2,
  Users,
  WifiOff,
  type LucideIcon,
} from "lucide-react";
import { IconButton, Loading, Menu, Popover, Tooltip, cn, toast } from "@tau/ui";
import type { CollaborationSession, JoinRequest } from "@tau/collaboration";
import type { EditorCollaborationBinding } from "@tau/editor-collab";
import { FadeScroll } from "@/components/FadeScroll";
import useCollaborationDocument from "@/hooks/useCollaborationDocument";
import { Editor } from "@tau/editor";
import { createYjsDocument } from "@tau/editor-collab";
import { useCollaborationKit } from "@/hooks/useCollaborationKit";
import useCollaborationPresence from "@/hooks/useCollaborationPresence";
import { CollaborativeTitleField } from "@/components/CollaborativeTitle";
import {
  AvatarStack,
  JoinRequestItem,
  LeaveDialog,
  SessionStatus,
  SharePanel,
} from "@/components/CollaborationUI";
import {
  formatInvitationCode,
  isStale,
  leaveLabel,
  othersSummary,
  pendingRequests,
} from "@/components/CollaborationUI/model";
import { useInvitation } from "@/components/CollaborationUI/useInvitation";
import { formatAgo } from "@/utils/formatAgo";
import { openableSource, sourceInfo } from "../model";
import { canOpenSource, openSource } from "../openSource";

/** 协作页的正文编辑器：成员加入的房间在本机没有内容行，走 documentId 直接绑定 */
function RoomEditor({
  binding,
  readonly,
}: {
  binding: EditorCollaborationBinding;
  readonly: boolean;
}) {
  const presence = useCollaborationPresence(binding, readonly);
  const kit = useCollaborationKit(binding);
  const document = useMemo(() => createYjsDocument(binding), [binding]);
  return (
    <Editor
      kit={kit}
      document={document}
      readonly={readonly}
      onFocus={presence.onFocus}
      onBlur={presence.onBlur}
    />
  );
}

const SOURCE_ICONS: Record<string, LucideIcon> = {
  article: FileText,
  card: Layers,
  "project-item": FolderKanban,
};

export function CollaborationRoom({
  session,
  requests,
  deviceId,
  onLeft,
}: {
  session: CollaborationSession;
  requests: JoinRequest[];
  deviceId?: string;
  onLeft: () => void;
}) {
  const { binding, article, error, frozen } = useCollaborationDocument(session.id);
  const [leaving, setLeaving] = useState(false);

  const ownerActive = session.role === "owner" && session.status === "active";
  const readonly = session.status !== "active" || frozen;
  const pending = pendingRequests(requests, session.id);
  const info = sourceInfo(session);
  const SourceIcon = (info.source && SOURCE_ICONS[info.source.sourceType ?? ""]) || Users;
  const source = openableSource(session);
  const invitation = useInvitation(session.id, ownerActive);

  const openOriginal = async () => {
    if (!source) return;
    try {
      await openSource(source);
    } catch (failure) {
      toast.error(failure instanceof Error ? failure.message : "打开失败");
    }
  };

  const banner = useMemo(() => {
    if (session.error)
      return {
        tone: "danger" as const,
        icon: AlertTriangle,
        text:
          session.status === "closed" && session.pending
            ? `${session.error}。本机还有未同步的改动，可以先复制需要的内容，再清理。`
            : session.error,
      };
    if (session.status === "active" && session.connection !== "connected")
      return {
        tone: "warn" as const,
        icon: WifiOff,
        text: session.pending
          ? "离线中，改动已保存在本机，恢复连接后自动合并。"
          : "离线中，暂时看不到其他成员的改动。",
      };
    return null;
  }, [session.error, session.status, session.pending, session.connection]);

  return (
    <section className="flex min-h-0 flex-1 flex-col">
      {/* 右侧 26px：末尾图标按钮自带内边距，图形右缘与页头按钮对齐 */}
      <header className="flex h-[44px] flex-none items-center gap-2 pl-8 pr-[26px]">
        <span className="text-ink-3 text-tau-sm flex min-w-0 items-center gap-1.5">
          <SourceIcon className="size-3.5 flex-none" strokeWidth={1.75} />
          <span className="truncate">
            {info.typeLabel}
            {info.title && ` · ${info.title}`}
          </span>
        </span>
        <span className="flex-1" />

        {session.status === "active" && (
          <Popover
            placement="bottom-end"
            arrow={false}
            className="w-[340px]"
            trigger={
              <button
                type="button"
                aria-label={ownerActive ? "成员与邀请" : "成员"}
                className="rounded-tau-sm text-ink-2 hover:bg-hover hover:text-ink-1 text-tau-meta flex h-[30px] cursor-pointer items-center gap-2 pl-1.5 pr-2.5"
              >
                <AvatarStack members={session.members} max={4} className="ring-surface" />
                <span>{othersSummary(session, deviceId)}</span>
                {pending.length > 0 && (
                  <span className="bg-accent text-ink-inverse min-w-[18px] rounded-full px-1.5 text-center text-[11px] font-[600] tabular-nums leading-[18px]">
                    {pending.length}
                  </span>
                )}
              </button>
            }
          >
            <Popover.Header icon={<Users className="size-[15px]" strokeWidth={1.75} />}>
              {ownerActive ? "成员与邀请" : "成员"}
            </Popover.Header>
            <Popover.Body>
              <SharePanel session={session} requests={requests} deviceId={deviceId} />
            </Popover.Body>
          </Popover>
        )}

        {ownerActive && invitation.data && (
          <Tooltip content="复制协作码">
            <button
              type="button"
              onClick={() => void invitation.copy()}
              className="border-line-1 text-ink-2 hover:border-ink-3 hover:text-ink-1 rounded-tau-sm flex h-7 cursor-pointer items-center gap-1.5 border px-2.5"
            >
              <KeyRound className="size-[13px]" strokeWidth={1.75} />
              <span className="font-tau-mono text-[12.5px] tabular-nums tracking-[0.06em]">
                {formatInvitationCode(invitation.data.code)}
              </span>
            </button>
          </Tooltip>
        )}

        {source && canOpenSource(source) && (
          <button
            type="button"
            onClick={() => void openOriginal()}
            className="rounded-tau-sm text-ink-2 hover:bg-hover hover:text-ink-1 text-tau-meta flex h-7 cursor-pointer items-center gap-1.5 px-2.5"
          >
            <ExternalLink className="size-[14px]" strokeWidth={1.75} />在{info.typeLabel}中打开
          </button>
        )}

        <Menu
          align="end"
          trigger={
            <IconButton aria-label="更多" title="更多">
              <MoreHorizontal className="size-4" strokeWidth={1.75} />
            </IconButton>
          }
        >
          {ownerActive && (
            <>
              <Menu.Item
                icon={<Copy className="size-[15px]" strokeWidth={1.75} />}
                disabled={!invitation.data}
                onSelect={() => void invitation.copy()}
              >
                复制协作码
              </Menu.Item>
              <Menu.Item
                icon={<RefreshCw className="size-[15px]" strokeWidth={1.75} />}
                disabled={invitation.rotating}
                onSelect={() => void invitation.rotate()}
              >
                {invitation.data ? "轮换协作码" : "生成协作码"}
              </Menu.Item>
              <Menu.Separator />
            </>
          )}
          <Menu.Item
            danger
            icon={
              isStale(session) ? (
                <Trash2 className="size-[15px]" strokeWidth={1.75} />
              ) : (
                <LogOut className="size-[15px]" strokeWidth={1.75} />
              )
            }
            onSelect={() => setLeaving(true)}
          >
            {leaveLabel(session)}
          </Menu.Item>
        </Menu>
      </header>

      {(banner || (ownerActive && pending.length > 0)) && (
        <div className="flex flex-none flex-col gap-1.5 px-8 pb-1">
          {banner && (
            <div
              role="status"
              className={cn(
                "rounded-tau-md text-tau-meta flex items-center gap-2.5 py-2 pl-3.5 pr-2",
                banner.tone === "danger" ? "bg-danger-soft text-danger" : "bg-warn-soft text-warn"
              )}
            >
              <banner.icon className="size-3.5 flex-none" strokeWidth={1.75} />
              <span className="min-w-0 flex-1">{banner.text}</span>
              {banner.tone === "danger" && (
                <button
                  type="button"
                  onClick={() => setLeaving(true)}
                  className="rounded-tau-sm hover:bg-hover h-7 flex-none cursor-pointer px-2.5 font-[500]"
                >
                  {leaveLabel(session)}
                </button>
              )}
            </div>
          )}
          {ownerActive &&
            pending.map(request => (
              <JoinRequestItem
                key={request.id}
                request={request}
                className="bg-hover"
                description="申请加入这份内容"
              />
            ))}
        </div>
      )}

      {/* FadeScroll 右侧 6px 透明边 + pr-[34px] = 左侧 pl-10，正文居中不偏 */}
      <FadeScroll className="mb-4 min-h-0 flex-1 pb-[104px] pl-10 pr-[34px] pt-7">
        {binding && article ? (
          <div className="mx-auto w-full max-w-[720px]">
            <CollaborativeTitleField
              key={session.id}
              binding={binding}
              article={article}
              frozen={frozen}
              error={error}
              contentEditable={!readonly}
              placeholder="未命名内容"
              className="text-ink-1 text-[26px] font-[600] leading-[1.35] tracking-[-0.01em]"
            />
            <div className="mt-6">
              <RoomEditor binding={binding} readonly={readonly} />
            </div>
          </div>
        ) : error ? (
          <p role="alert" className="text-danger text-tau-meta pt-20 text-center">
            {error}
          </p>
        ) : (
          <Loading />
        )}
      </FadeScroll>

      <footer className="text-ink-3 text-tau-sm flex h-[38px] flex-none items-center gap-3.5 px-8 pb-1">
        <SessionStatus session={session} />
        <span className="flex-1" />
        <span>更新于 {formatAgo(session.updatedAt)}</span>
      </footer>

      <LeaveDialog session={session} open={leaving} onOpenChange={setLeaving} onLeft={onLeft} />
    </section>
  );
}
