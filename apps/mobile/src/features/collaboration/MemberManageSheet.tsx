// 成员管理（设计稿 04 方案 B）：协作码卡置顶，向下依次为待审批、成员、危险操作。
// 单列滚动一屏管完一个房间，复制码零跳步。
import { useState } from "react";
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

type PendingConfirm = {
  title: string;
  description?: string;
  confirmText: string;
  action: () => Promise<void>;
};

export function MemberManageSheet(props: {
  documentId: string;
  onClose: () => void;
  onExit: () => void;
  onError: (error: unknown, fallback: string) => void;
}) {
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

  const status = useStableSessionStatus(session);
  const isOwner = session?.role === "owner";
  const members: Member[] = session?.members ?? [];

  const rotate = async () => {
    setBusy(true);
    try {
      const result = await collaborationManager.rotateInvitation(props.documentId);
      writeCachedInvitation(props.documentId, result);
      setInvitation(result);
      toast.success("已生成新的协作码");
    } catch (failure) {
      props.onError(failure, "生成协作码失败");
    } finally {
      setBusy(false);
    }
  };

  const copy = () => {
    if (!invitation) return;
    void window.navigator.clipboard
      .writeText(invitation.code)
      .then(() => toast.success("协作码已复制"))
      .catch(() => toast.warning("复制失败"));
  };

  const decide = async (request: JoinRequest, approve: boolean) => {
    setBusy(true);
    try {
      await collaborationManager.decideJoinRequest(request.id, approve);
      toast.success(approve ? `已批准 ${request.nickname}` : `已拒绝 ${request.nickname}`);
    } catch (failure) {
      props.onError(failure, approve ? "批准加入失败" : "拒绝加入失败");
    } finally {
      setBusy(false);
    }
  };

  const runConfirmed = async () => {
    const pending = confirming;
    if (!pending) return;
    setBusy(true);
    try {
      await pending.action();
      setConfirming(undefined);
    } catch (failure) {
      props.onError(failure, "操作失败");
    } finally {
      setBusy(false);
    }
  };

  return (
    // backDismiss=false：本 Sheet 用 finish("ended") 回传结束结果，内置返回拦截会吞掉
    // 弹栈请求；普通返回由路由直接弹出 overlay（见 memberSheet.page）。
    <BottomSheet open title="共享与成员" onClose={props.onClose} backDismiss={false}>
      <div className="scrollbar-hide -mx-1 max-h-[68dvh] overflow-y-auto px-1 pb-2">
        {status ? (
          <div className="mb-3 flex items-center justify-center">
            <StatusBadge tone={status.tone}>
              {status.tone === "live"
                ? `${status.label} · ${members.filter(member => member.online).length} 人在线`
                : status.label}
            </StatusBadge>
          </div>
        ) : (
          <p className="text-ink-2 mb-3 text-center text-[12.5px]">该协作已不在你的列表中</p>
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
              待审批 · {requests.length}
            </GroupLabel>
            <div className="bg-tag-4-soft rounded-[18px] px-3.5">
              {requests.map(request => (
                <ApprovalRow
                  key={request.id}
                  request={request}
                  busy={busy}
                  hint="凭协作码申请"
                  onDecide={approve => void decide(request, approve)}
                />
              ))}
            </div>
          </>
        ) : null}

        <GroupLabel inset="sheet" className="font-bold">
          成员 · {members.length}
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
                        title: `移除 ${target.nickname}？`,
                        description: "该设备将立即失去访问权限，其已保存的内容不受影响。",
                        confirmText: "移除",
                        action: async () => {
                          await collaborationManager.removeMember(
                            props.documentId,
                            target.deviceId
                          );
                          toast.success(`已移除 ${target.nickname}`);
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
                const text = leaveCollabText(true);
                setConfirming({
                  title: text.title,
                  description: text.description,
                  confirmText: text.confirmText,
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
              <Trash2 size={16} /> 结束共享并清空云端数据
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                const text = leaveCollabText(false);
                setConfirming({
                  title: text.title,
                  description: text.description,
                  confirmText: text.confirmText,
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
              <LogOut size={16} /> 退出协作
            </button>
          )}
        </div>
      </div>

      <MobileConfirmDialog
        open={Boolean(confirming)}
        danger
        loading={busy}
        title={confirming?.title ?? ""}
        description={confirming?.description}
        confirmText={confirming?.confirmText}
        onCancel={() => setConfirming(undefined)}
        onConfirm={() => void runConfirmed()}
      />
    </BottomSheet>
  );
}
