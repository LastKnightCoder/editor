import { useState } from "react";
import { Check, LogOut, RefreshCw, Share2, UserMinus, X } from "lucide-react";
import { toast } from "@tau/ui";
import type { ContentSessionTarget } from "@tau/collaboration";
import {
  createSharedContent,
  decideJoinRequest,
  generateCollaborationInvitation,
  getCurrentCollaborationInvitation,
  leaveCollaboration,
  removeCollaborationMember,
} from "@/commands";
import useContentSession from "@/hooks/useContentSession";
import useCollaborationStore from "@/stores/useCollaborationStore";
import CustomModal from "@/components/CustomModal";
import { useStableSessionStatus } from "@/pages/CollaborationView/session-status";
import {
  Avatar,
  AvatarStack,
  CopyButton,
  IconButton,
  StatusBadge,
  StatusDot,
  editingMemberCount,
  memberActivity,
} from "@/components/CollaborationUI";

interface PendingConfirm {
  title: string;
  description: string;
  confirmText: string;
  action: () => Promise<void>;
}

export default function ContentCollaborationControl({
  contentId,
  documentId,
  source,
  compact = false,
}: {
  contentId?: number;
  documentId?: string;
  source?: Omit<ContentSessionTarget, "contentId">;
  compact?: boolean;
}) {
  const { entry } = useContentSession(contentId, source);
  const origin = source || entry?.source;
  const state = useCollaborationStore();
  const [createdId, setCreatedId] = useState<string>();
  const id = documentId || (entry?.mode === "shared" ? entry.documentId : createdId);
  const session = state.sessions.find(value => value.id === id);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState("");
  const [codeExpiresAt, setCodeExpiresAt] = useState<number>();
  const [error, setError] = useState<string>();
  const [confirming, setConfirming] = useState<PendingConfirm>();
  const requests = state.requests.filter(
    request => request.documentId === id && request.status === "pending"
  );
  const run = async (action: () => Promise<void>): Promise<boolean> => {
    setBusy(true);
    setError(undefined);
    try {
      await action();
      return true;
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "操作失败");
      return false;
    } finally {
      setBusy(false);
    }
  };
  const generateCode = async () => {
    if (session) {
      if (session.role !== "owner" || session.status !== "active") return;
      const result = await generateCollaborationInvitation(session.id);
      setCode(result.code);
      setCodeExpiresAt(result.expiresAt);
    } else if (contentId) {
      const result = await createSharedContent(
        contentId,
        origin?.sourceType || "content",
        origin?.sourceId || contentId,
        origin?.sourceType === "card" ? undefined : entry?.title || origin?.sourceTitle
      );
      setCreatedId(result.documentId);
      setCode(result.code);
      setCodeExpiresAt(undefined);
    }
  };
  const active = session?.status === "active";
  const status = useStableSessionStatus(session);
  const editors = session ? editingMemberCount(session) : 0;
  const label = session ? (active ? `${editors} 人正在编辑` : "共享已结束") : "发起协作";
  const members = session
    ? [...session.members].sort((a, b) => Number(b.online) - Number(a.online))
    : [];
  if (!contentId && !documentId) return null;
  return (
    <span
      className="inline-flex min-w-0 align-middle"
      onClick={event => event.stopPropagation()}
      onMouseDown={event => event.stopPropagation()}
    >
      <button
        type="button"
        className={`hover:bg-hover inline-flex min-h-[22px] max-w-full cursor-pointer items-center gap-1.5 rounded-full bg-transparent py-0.5 align-middle text-xs text-inherit transition duration-150 ease-out focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--th-border-focus)] disabled:cursor-wait disabled:opacity-50 ${
          compact ? "px-1" : "px-2"
        }`}
        aria-label={session ? `协作：${label}` : "发起协作"}
        title={
          session
            ? `${label} · ${status?.label}${requests.length ? ` · ${requests.length} 个待审批` : ""}`
            : "发起协作"
        }
        disabled={busy || entry?.frozen}
        onClick={() => {
          setOpen(true);
          if (!session) {
            void run(generateCode);
            return;
          }
          // 已共享：优先取本机缓存的协作码（只读，不轮换），无缓存再由作者手动生成。
          if (session.role === "owner" && active)
            void run(async () => {
              const cached = await getCurrentCollaborationInvitation(session.id);
              setCode(cached?.code || "");
              setCodeExpiresAt(cached?.expiresAt);
            });
        }}
      >
        {session ? (
          <StatusDot tone={active && session.connection === "connected" ? "live" : status!.tone} />
        ) : (
          <Share2 size={13} className="text-text-3" />
        )}
        {!compact && (
          <span className="overflow-hidden text-ellipsis whitespace-nowrap">{label}</span>
        )}
        {requests.length > 0 && (
          <span className="bg-status-error min-w-4 rounded-full px-1 text-center text-[10px] font-semibold tabular-nums leading-4 text-white">
            {requests.length}
          </span>
        )}
      </button>
      <CustomModal
        open={open}
        onCancel={() => setOpen(false)}
        title="内容协作"
        subtitle={session?.title || origin?.sourceTitle}
        width={480}
        footer={null}
      >
        <div className="flex flex-col gap-4">
          {error && (
            <div className="text-status-error rounded-lg bg-[color-mix(in_oklab,var(--th-danger)_10%,transparent)] px-3 py-2 text-xs [overflow-wrap:anywhere]">
              {error}
            </div>
          )}
          <div className="flex min-h-[22px] items-center justify-between gap-3" role="status">
            {busy && !session ? (
              <StatusBadge tone="syncing">正在生成协作码…</StatusBadge>
            ) : session && status ? (
              <StatusBadge tone={status.tone}>
                {status.tone === "live" ? `${status.label} · ${editors} 人正在编辑` : status.label}
              </StatusBadge>
            ) : (
              <StatusBadge tone="idle">尚未共享</StatusBadge>
            )}
            {session && <AvatarStack members={session.members} size={18} />}
          </div>
          {(session?.role === "owner" || !session) && (
            <div className="flex flex-col gap-2">
              <div className="border-border-1 bg-bg-input flex items-center gap-2.5 rounded-xl border px-3.5 py-2.5">
                <code
                  className="text-text-1 min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[15px] tracking-[0.08em]"
                  data-testid="collaboration-code"
                >
                  {code || "———— ———— ————"}
                </code>
                {code ? (
                  <CopyButton
                    variant="solid"
                    value={code}
                    label="复制协作码"
                    onCopied={() => toast.success("协作码已复制")}
                  />
                ) : (
                  <IconButton
                    label="生成协作码"
                    disabled={busy}
                    onClick={() => void run(generateCode)}
                  >
                    <RefreshCw size={14} />
                  </IconButton>
                )}
              </div>
              <div className="flex items-center justify-between gap-2">
                <p className="text-text-3 m-0 text-xs">
                  {codeExpiresAt
                    ? `${Math.max(1, Math.ceil((codeExpiresAt - Date.now()) / 86400000))} 天后过期 · 轮换后旧码失效`
                    : "协作码 7 天有效 · 轮换后旧码失效"}
                </p>
                {code && active && (
                  <button
                    type="button"
                    className="text-active-text hover:bg-active inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-md border-0 bg-transparent px-1.5 py-0.5 text-xs transition duration-150 disabled:cursor-default disabled:opacity-50"
                    disabled={busy}
                    onClick={() => void run(generateCode)}
                  >
                    <RefreshCw size={12} /> 轮换协作码
                  </button>
                )}
              </div>
            </div>
          )}
          {session && (
            <section className="flex flex-col gap-1.5">
              <h4 className="text-text-3 m-0 text-[11px] font-semibold uppercase tracking-[0.05em]">
                成员 · {session.members.length}
              </h4>
              <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
                {members.map(member => (
                  <li
                    key={member.deviceId}
                    className="hover:bg-hover group -mx-1.5 flex min-w-0 items-center gap-2.5 rounded-lg px-1.5 py-1.5 transition duration-150"
                  >
                    <Avatar id={member.deviceId} name={member.nickname} online={member.online} />
                    <span
                      className="text-text-1 min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-[13px]"
                      title={member.deviceId}
                    >
                      {member.nickname}
                    </span>
                    {member.role === "owner" ? (
                      <span className="bg-active text-active-text flex-none rounded-full px-2 py-px text-[11px] leading-4">
                        作者
                      </span>
                    ) : (
                      member.online && (
                        <span
                          className={`flex-none text-[11px] ${
                            member.activity === "editing" ? "text-status-success" : "text-text-3"
                          }`}
                        >
                          {memberActivity(member)}
                        </span>
                      )
                    )}
                    {session.role === "owner" && member.role !== "owner" && active && (
                      <IconButton
                        danger
                        label={`移除 ${member.nickname}`}
                        className="opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
                        disabled={busy}
                        onClick={() =>
                          setConfirming({
                            title: `移除 ${member.nickname}？`,
                            description: "该设备将立即失去访问权限，其已保存的内容不受影响。",
                            confirmText: "移除",
                            action: async () => {
                              await removeCollaborationMember(session.id, member.deviceId);
                            },
                          })
                        }
                      >
                        <UserMinus size={13} />
                      </IconButton>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}
          {requests.length > 0 && (
            <section className="flex flex-col gap-1 rounded-xl bg-[color-mix(in_oklab,var(--th-warning)_8%,transparent)] p-2">
              <h4 className="text-text-3 m-0 px-1.5 pt-0.5 text-[11px] font-semibold uppercase tracking-[0.05em]">
                待审批 · {requests.length}
              </h4>
              <ul className="m-0 flex list-none flex-col p-0">
                {requests.map(request => (
                  <li
                    key={request.id}
                    className="flex min-w-0 items-center gap-2.5 rounded-lg px-1.5 py-1.5"
                  >
                    <Avatar id={request.deviceId} name={request.nickname} />
                    <span className="text-text-1 min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-[13px]">
                      {request.nickname} 申请加入
                    </span>
                    <IconButton
                      tone="success"
                      label="批准"
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          await decideJoinRequest(request.id, true);
                        })
                      }
                    >
                      <Check size={14} />
                    </IconButton>
                    <IconButton
                      danger
                      label="拒绝"
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          await decideJoinRequest(request.id, false);
                        })
                      }
                    >
                      <X size={14} />
                    </IconButton>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {session && (
            <div className="border-border-2 -mb-2 flex justify-end border-t pt-3">
              <button
                type="button"
                className="text-status-error inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border-0 bg-transparent px-3 text-xs font-medium transition duration-150 ease-out hover:bg-[color-mix(in_oklab,var(--th-danger)_8%,transparent)] disabled:cursor-default disabled:opacity-50"
                disabled={busy}
                onClick={() => {
                  if (session.pending) {
                    toast.warning("仍有未同步改动，请等待同步后再退出");
                    return;
                  }
                  setConfirming(
                    session.role === "owner"
                      ? {
                          title: "结束共享？",
                          description:
                            "所有成员将停止协作，服务器上的正文与附件会被清理，原内容保留在本机。",
                          confirmText: "结束共享",
                          action: async () => {
                            await leaveCollaboration(session.id);
                          },
                        }
                      : {
                          title: "退出协作？",
                          description: "已保存的本地内容会保留，之后不再自动加入这段共享。",
                          confirmText: "退出",
                          action: async () => {
                            await leaveCollaboration(session.id);
                          },
                        }
                  );
                }}
              >
                <LogOut size={13} />
                {session.role === "owner" ? "结束共享" : "退出协作"}
              </button>
            </div>
          )}
        </div>
      </CustomModal>
      <CustomModal
        open={Boolean(confirming)}
        onCancel={() => setConfirming(undefined)}
        title={confirming?.title}
        subtitle={confirming?.description}
        width={380}
        okText={confirming?.confirmText}
        confirmLoading={busy}
        okButtonProps={{ className: "bg-status-error!" }}
        onOk={async () => {
          if (!confirming) return;
          const success = await run(confirming.action);
          setConfirming(undefined);
          if (success) {
            setCode("");
            setCreatedId(undefined);
            setOpen(false);
          }
        }}
      />
    </span>
  );
}
