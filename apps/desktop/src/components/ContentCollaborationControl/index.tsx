/**
 * 内容页协作入口（文章 / 卡片 / 项目文档）：底栏触发位 + 「内容协作」对话框。
 *
 * 未共享：先说明（协作码 / 本地块不共享 / 可随时结束）再确认「发起共享」——共享会暂停本地编辑、
 * 上传附件并创建共享文档，不在打开对话框时静默执行。已共享：协作码 / 待审批 / 成员与结束共享，
 * 与协作页的成员面板是同一套件（CollaborationUI）。
 *
 * 新页面经 ref.open() 从「更多」菜单打开（hideTrigger）；legacy 编辑页与 e2e 仍用底栏触发位。
 * presence：已共享时在挂载处常驻成员条（头像 + 在线摘要 + 待审批数），点击 / open() 弹出
 * 「成员与邀请」Popover（同协作页顶栏）；未共享时不占位，open() 仍走「发起协作」对话框。
 */

import { useEffect, useImperativeHandle, useState, type Ref } from "react";
import { ArrowRight, KeyRound, LogOut, Share2, Trash2, Users, Wand2 } from "lucide-react";
import { Button, Dialog, Popover, toast } from "@tau/ui";
import type { ContentSessionTarget } from "@tau/collaboration";
import { sessionStatus } from "@tau/collaboration/src/view";
import { createSharedContent } from "@/commands";
import useContentSession from "@/hooks/useContentSession";
import useCollaborationStore from "@/stores/useCollaborationStore";
import { openPage } from "@/services/page-navigation";
import {
  AvatarStack,
  LeaveDialog,
  SessionStatus,
  SharePanel,
  StatusDot,
} from "@/components/CollaborationUI";
import {
  isStale,
  leaveLabel,
  othersSummary,
  pendingRequests,
} from "@/components/CollaborationUI/model";

export interface ContentCollaborationControlHandle {
  open: () => void;
}

const POINTS = [
  { icon: KeyRound, text: "生成一个 12 位协作码，对方输入后需要你同意" },
  { icon: Wand2, text: "白板、数据库这类本地块不会共享，成员看到的是占位说明" },
  { icon: LogOut, text: "随时可以结束共享，服务器上的副本会被清理" },
];

export default function ContentCollaborationControl({
  contentId,
  source,
  ref,
  hideTrigger = false,
  presence = false,
}: {
  contentId?: number;
  source?: Omit<ContentSessionTarget, "contentId">;
  ref?: Ref<ContentCollaborationControlHandle>;
  hideTrigger?: boolean;
  /** 已共享时常驻成员条 + 成员 Popover（替代对话框） */
  presence?: boolean;
}) {
  const { entry, error: sessionError } = useContentSession(contentId, source);
  const sessions = useCollaborationStore(state => state.sessions);
  const requests = useCollaborationStore(state => state.requests);
  const deviceId = useCollaborationStore(state => state.deviceId);
  const [open, setOpen] = useState(false);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [openRequested, setOpenRequested] = useState(false);
  const [creating, setCreating] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [error, setError] = useState<string>();
  // 共享刚完成时内容会话的广播可能晚于命令返回，先用返回的文档 id 接上
  const [createdId, setCreatedId] = useState<string>();

  const documentId = entry?.mode === "shared" ? entry.documentId : createdId;
  const session = sessions.find(item => item.id === documentId);
  const pending = session ? pendingRequests(requests, session.id) : [];
  const origin = source || entry?.source;
  const title = session?.title || entry?.title || origin?.sourceTitle;
  const summary = session ? othersSummary(session, deviceId) : undefined;

  useImperativeHandle(ref, () => ({ open: () => setOpenRequested(true) }), []);
  // 菜单打开时会话可能尚未就绪：等 entry 或错误到位再打开
  useEffect(() => {
    if (!openRequested || (!entry && !sessionError)) return;
    setOpenRequested(false);
    if (sessionError) toast.error(sessionError);
    else if (presence && session) setPopoverOpen(true);
    else setOpen(true);
  }, [openRequested, entry, sessionError, presence, session]);

  const share = async () => {
    if (!contentId) return;
    setCreating(true);
    setError(undefined);
    try {
      const result = await createSharedContent(
        contentId,
        origin?.sourceType || "content",
        origin?.sourceId || contentId,
        // 卡片不参与标题同步
        origin?.sourceType === "card" ? undefined : title
      );
      setCreatedId(result.documentId);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "共享失败");
    } finally {
      setCreating(false);
    }
  };

  const viewInCenter = () => {
    if (!session) return;
    try {
      openPage("collaboration", { id: session.id });
      setOpen(false);
      setPopoverOpen(false);
    } catch (failure) {
      toast.error(failure instanceof Error ? failure.message : "无法打开协作页");
    }
  };

  if (!contentId) return null;

  return (
    <span onClick={event => event.stopPropagation()} onMouseDown={event => event.stopPropagation()}>
      {presence && session && (
        <Popover
          placement="bottom-end"
          arrow={false}
          className="w-[340px]"
          open={popoverOpen}
          onOpenChange={setPopoverOpen}
          trigger={
            <button
              type="button"
              aria-label={`协作成员：${summary}`}
              className="rounded-tau-sm text-ink-3 hover:bg-hover hover:text-ink-1 text-tau-meta flex h-[26px] cursor-pointer items-center gap-1.5 pl-1 pr-2 transition-colors"
            >
              <AvatarStack members={session.members} max={3} size={18} />
              <span className="whitespace-nowrap">
                {session.status === "active" ? summary : "共享已结束"}
              </span>
              {pending.length > 0 && (
                <span className="bg-accent text-ink-inverse min-w-4 rounded-full px-1 text-center text-[10.5px] font-[600] tabular-nums leading-4">
                  {pending.length}
                </span>
              )}
            </button>
          }
        >
          <Popover.Header icon={<Users className="size-[15px]" strokeWidth={1.75} />}>
            {session.role === "owner" && session.status === "active" ? "成员与邀请" : "成员"}
          </Popover.Header>
          <Popover.Body>
            <div className="flex flex-col gap-4">
              <SessionStatus session={session} />
              <SharePanel session={session} requests={requests} deviceId={deviceId} />
            </div>
          </Popover.Body>
          <Popover.Footer>
            <Button variant="ghost" size="sm" className="mr-auto" onClick={viewInCenter}>
              在协作页查看
              <ArrowRight className="size-3.5" strokeWidth={1.75} />
            </Button>
            <Button
              variant="danger-soft"
              size="sm"
              icon={isStale(session) ? Trash2 : LogOut}
              onClick={() => {
                setPopoverOpen(false);
                setLeaving(true);
              }}
            >
              {leaveLabel(session)}
            </Button>
          </Popover.Footer>
        </Popover>
      )}

      {!hideTrigger && !(presence && session) && (
        <button
          type="button"
          aria-label={session ? `协作：${summary}` : "发起协作"}
          disabled={entry?.frozen}
          onClick={() => setOpen(true)}
          className="rounded-tau-sm text-ink-2 hover:bg-hover hover:text-ink-1 text-tau-sm inline-flex h-6 cursor-pointer items-center gap-2 px-2 disabled:cursor-default disabled:opacity-50"
        >
          {session ? (
            <>
              <StatusDot tone={sessionStatus(session).tone} />
              <span className="whitespace-nowrap">
                {session.status === "active" ? summary : "共享已结束"}
              </span>
              <AvatarStack members={session.members} max={3} size={16} />
              {pending.length > 0 && (
                <span className="bg-accent text-ink-inverse min-w-4 rounded-full px-1 text-center text-[10.5px] font-[600] tabular-nums leading-4">
                  {pending.length}
                </span>
              )}
            </>
          ) : (
            <>
              <Share2 className="text-ink-3 size-[13px]" strokeWidth={1.75} />
              发起协作
            </>
          )}
        </button>
      )}

      <Dialog
        open={open}
        onOpenChange={setOpen}
        onAfterClose={() => setError(undefined)}
        locked={creating}
        width={480}
        title={session ? "内容协作" : "发起协作"}
        context={title || undefined}
        footer={
          session ? (
            <>
              <Button variant="ghost" className="mr-auto" onClick={viewInCenter}>
                在协作页查看
                <ArrowRight className="size-3.5" strokeWidth={1.75} />
              </Button>
              <Button
                variant="danger-soft"
                icon={isStale(session) ? Trash2 : LogOut}
                onClick={() => setLeaving(true)}
              >
                {leaveLabel(session)}
              </Button>
            </>
          ) : (
            <>
              <Button variant="secondary" onClick={() => setOpen(false)}>
                取消
              </Button>
              <Button
                variant="primary"
                icon={Share2}
                data-autofocus
                loading={creating}
                loadingText="正在共享…"
                onClick={() => void share()}
              >
                发起共享
              </Button>
            </>
          )
        }
      >
        {error && (
          <p
            role="alert"
            className="bg-danger-soft text-danger text-tau-meta rounded-tau-sm mb-3 px-3 py-2"
          >
            {error}
          </p>
        )}
        {session ? (
          <div className="flex flex-col gap-4">
            <SessionStatus session={session} suffix={summary} />
            <SharePanel session={session} requests={requests} deviceId={deviceId} />
          </div>
        ) : (
          <div className="text-ink-2 text-tau-body">
            <p>把这份内容共享给其他设备实时编辑。共享后它仍在原处，你照常在这里写。</p>
            <ul className="mt-3 flex flex-col gap-2">
              {POINTS.map(point => (
                <li key={point.text} className="flex items-start gap-2.5">
                  <point.icon
                    className="text-ink-3 mt-[3px] size-3.5 flex-none"
                    strokeWidth={1.75}
                  />
                  <span className="text-tau-meta">{point.text}</span>
                </li>
              ))}
            </ul>
            {creating && (
              <p className="text-ink-3 text-tau-sm mt-3 flex items-center gap-1.5">
                <Users className="size-3.5" strokeWidth={1.75} />
                正在暂停本地编辑、上传附件并创建共享文档…
              </p>
            )}
          </div>
        )}
      </Dialog>

      {session && (
        <LeaveDialog
          session={session}
          open={leaving}
          onOpenChange={setLeaving}
          onLeft={() => {
            setOpen(false);
            setPopoverOpen(false);
          }}
        />
      )}
    </span>
  );
}
