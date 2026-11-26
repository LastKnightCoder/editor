import { useCollaborationStatusI18n, sessionStatusText } from "./status.i18n";
// 成员管理：协作码卡置顶，向下依次为待审批、成员、危险操作。
// 单列滚动一屏管完一个房间，复制码零跳步。
import { useState } from "react";
import { useRoomI18n, roomTranslator } from "./room.i18n";
import { LogOut, Trash2 } from "lucide-react";
import type { JoinRequest, Member } from "@tau/collaboration";
import { BottomSheet } from "../../components/BottomSheet";
import { GroupLabel } from "../../components/GroupLabel";
import { MobileConfirmDialog } from "../../components/MobileConfirmDialog";
import { toast } from "../../components/toast";
import { collaborationManager } from "./core/manager";
import {
  readCachedInvitation,
  writeCachedInvitation,
  type CachedInvitation,
} from "./core/invitation-cache";
import { leaveCollabText, runLeaveCollab } from "./leaveCollab";
import { useCollaborationStore } from "./core/store";
import { ApprovalRow } from "./components/ApprovalRow";
import { CollabCodeCard, MemberRow, StatusBadge } from "./components/CollaborationUI";
import { useStableSessionStatus } from "./session-status";

type PendingConfirm = { action: () => Promise<void> } & (
  | { kind: "remove"; target: Member }
  | { kind: "leave"; owner: boolean }
);

export function MemberManageSheet(props: {
  documentId: string;
  backDismiss?: boolean;
  guard?: () => void;
  onClose: () => void;
  onExit: () => void;
  onError: (error: unknown, fallback: string) => void;
}) {
  const context = useCollaborationStatusI18n();
  const roomContext = useRoomI18n();
  const { t, locale } = roomContext;
  const session = useCollaborationStore(state =>
    state.sessions.find(item => item.id === props.documentId)
  );
  const requests = useCollaborationStore(state =>
    state.requests.filter(request => request.documentId === props.documentId)
  );
  const selfId = useCollaborationStore(state => state.deviceId);
  const [busy, setBusy] = useState(false);
  const [invitation, setInvitation] = useState<CachedInvitation | undefined>(() =>
    readCachedInvitation(props.documentId)
  );
  const [confirming, setConfirming] = useState<PendingConfirm>();

  const confirmView = confirming
    ? confirming.kind === "remove"
      ? {
          title: t("member.removeTitle", { nickname: confirming.target.nickname }),
          description: t("member.removeHint"),
          confirmText: t("member.remove"),
        }
      : leaveCollabText(confirming.owner, roomContext)
    : undefined;
  const status = useStableSessionStatus(session);
  const isOwner = session?.role === "owner";
  const members: Member[] = session?.members ?? [];

  const rotate = async () => {
    setBusy(true);
    try {
      props.guard?.();
      const result = await collaborationManager.rotateInvitation(props.documentId);
      props.guard?.();
      writeCachedInvitation(props.documentId, result);
      setInvitation(result);
      toast.success(roomTranslator.t("code.generated"));
    } catch (failure) {
      props.onError(failure, roomTranslator.t("code.failed"));
    } finally {
      setBusy(false);
    }
  };

  const copy = () => {
    if (!invitation) return;
    void window.navigator.clipboard
      .writeText(invitation.code)
      .then(() => toast.success(roomTranslator.t("code.copied")))
      .catch(() => toast.warning(roomTranslator.t("code.copyFailed")));
  };

  const decide = async (request: JoinRequest, approve: boolean) => {
    setBusy(true);
    try {
      props.guard?.();
      await collaborationManager.decideJoinRequest(request.id, approve);
      props.guard?.();
      toast.success(
        roomTranslator.t(approve ? "request.approved" : "request.rejected", {
          nickname: request.nickname,
        })
      );
    } catch (failure) {
      props.onError(
        failure,
        roomTranslator.t(approve ? "request.approveFailed" : "request.rejectFailed")
      );
    } finally {
      setBusy(false);
    }
  };

  const runConfirmed = async () => {
    const pending = confirming;
    if (!pending) return;
    setBusy(true);
    try {
      props.guard?.();
      await pending.action();
      props.guard?.();
      setConfirming(undefined);
    } catch (failure) {
      props.onError(failure, roomTranslator.t("error.operation"));
    } finally {
      setBusy(false);
    }
  };

  return (
    // backDismiss=false：本 Sheet 用 finish("ended") 回传结束结果，内置返回拦截会吞掉
    // 弹栈请求；普通返回由路由直接弹出 overlay（见 memberSheet.page）。
    <BottomSheet
      open
      title={t("member.title")}
      onClose={props.onClose}
      backDismiss={props.backDismiss ?? false}
    >
      <div className="scrollbar-hide -mx-1 max-h-[68dvh] overflow-y-auto px-1 pb-2">
        {status ? (
          <div className="mb-3 flex items-center justify-center">
            <StatusBadge tone={status.tone}>
              {status.tone === "live"
                ? context.t("status.withOnline", {
                    state: sessionStatusText(status, context),
                    count: members.filter(member => member.online).length,
                    amount: members
                      .filter(member => member.online)
                      .length.toLocaleString(context.locale),
                  })
                : sessionStatusText(status, context)}
            </StatusBadge>
          </div>
        ) : (
          <p className="text-ink-2 mb-3 text-center text-[12.5px]">{t("member.missing")}</p>
        )}

        {isOwner ? (
          <CollabCodeCard
            code={invitation?.code}
            expiresAt={invitation?.expiresAt}
            busy={busy}
            onCopy={copy}
            onRotate={() => void rotate()}
          />
        ) : null}

        {requests.length > 0 ? (
          <>
            <GroupLabel inset="sheet" tone="warn" className="font-bold">
              {t("center.pending")} · {requests.length.toLocaleString(locale)}
            </GroupLabel>
            <div className="bg-tag-4-soft rounded-[18px] px-3.5">
              {requests.map(request => (
                <ApprovalRow
                  key={request.id}
                  request={request}
                  busy={busy}
                  hint={t("member.fromCode")}
                  onDecide={approve => void decide(request, approve)}
                />
              ))}
            </div>
          </>
        ) : null}

        <GroupLabel inset="sheet" className="font-bold">
          {t("member.members")} · {members.length.toLocaleString(locale)}
        </GroupLabel>
        <div className="divide-line-2 divide-y">
          {members.map(member => (
            <MemberRow
              key={member.deviceId}
              member={member}
              selfId={selfId}
              removeDisabled={busy}
              onRemove={
                isOwner
                  ? target =>
                      setConfirming({
                        kind: "remove",
                        target,
                        action: async () => {
                          await collaborationManager.removeMember(
                            props.documentId,
                            target.deviceId
                          );
                          toast.success(
                            roomTranslator.t("member.removed", { nickname: target.nickname })
                          );
                        },
                      })
                  : undefined
              }
            />
          ))}
        </div>

        <div className="divide-line-2 border-line-2 mt-4 divide-y border-t">
          {isOwner ? (
            <button
              type="button"
              onClick={() => {
                setConfirming({
                  kind: "leave",
                  owner: true,
                  action: async () => {
                    await runLeaveCollab(
                      documentId => collaborationManager.leave(documentId),
                      props.documentId,
                      true
                    );
                    props.onExit();
                  },
                });
              }}
              className="text-tag-5 flex w-full items-center justify-center gap-2 py-3.5 text-[14px] font-bold"
            >
              <Trash2 size={16} /> {t("leave.owner.label")}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                setConfirming({
                  kind: "leave",
                  owner: false,
                  action: async () => {
                    await runLeaveCollab(
                      documentId => collaborationManager.leave(documentId),
                      props.documentId,
                      false
                    );
                    props.onExit();
                  },
                });
              }}
              className="text-tag-5 flex w-full items-center justify-center gap-2 py-3.5 text-[14px] font-bold"
            >
              <LogOut size={16} /> {t("leave.member.confirm")}
            </button>
          )}
        </div>
      </div>

      <MobileConfirmDialog
        open={Boolean(confirming)}
        danger
        loading={busy}
        title={confirmView?.title ?? ""}
        description={confirmView?.description}
        confirmText={confirmView?.confirmText}
        onCancel={() => setConfirming(undefined)}
        onConfirm={() => void runConfirmed()}
      />
    </BottomSheet>
  );
}
