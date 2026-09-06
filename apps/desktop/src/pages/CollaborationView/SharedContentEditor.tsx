import { useState } from "react";
import { App } from "antd";
import { LoadingOutlined } from "@ant-design/icons";
import { LogOut, Ticket, Trash2, UserMinus } from "lucide-react";
import { invoke } from "@/electron";
import useCollaborationDocument from "@/hooks/useCollaborationDocument";
import CollaborationEditor from "@/components/CollaborationEditor";
import CustomModal from "@/components/CustomModal";
import { replaceText, type CollaborationSession } from "@tau/collaboration";
import {
  Avatar,
  IconButton,
  StatusBadge,
  editingMemberCount,
  memberActivity,
} from "@/components/CollaborationUI";
import { useStableSessionStatus } from "./session-status";

export default function SharedContentEditor({ session }: { session: CollaborationSession }) {
  const { binding, article, error, frozen } = useCollaborationDocument(session.id);
  const { message } = App.useApp();
  const [busy, setBusy] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const status = useStableSessionStatus(session);
  const stale =
    session.leaving ||
    session.connection === "offline" ||
    session.connection === "error" ||
    Boolean(session.error);
  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await action();
    } catch (failure) {
      message.error(failure instanceof Error ? failure.message : "操作失败");
    } finally {
      setBusy(false);
    }
  };
  const readonly = session.status !== "active" || frozen;
  const displayError = leaving ? undefined : error;
  return (
    <main className="bg-bg-container flex min-w-0 flex-1 flex-col">
      <div className="border-border-1 bg-bg-container flex min-h-11 items-center gap-2.5 border-b px-4 py-1.5">
        <div className="flex min-w-0 flex-1 items-center">
          <StatusBadge tone={status.tone}>
            {displayError || status.label}
            {status.tone === "live" && session.status === "active"
              ? ` · ${editingMemberCount(session)} 人正在编辑`
              : ""}
          </StatusBadge>
        </div>
        <div className="flex items-center gap-1">
          {session.role === "owner" && session.status === "active" && (
            <IconButton
              label="生成并复制协作码"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  const value = await invoke<{ code: string }>(
                    "collaboration:invitation",
                    session.id
                  );
                  await navigator.clipboard.writeText(value.code);
                  message.success(`协作码已复制：${value.code}`);
                })
              }
            >
              <Ticket size={16} />
            </IconButton>
          )}
          <i className="mx-1 h-4 w-px bg-[var(--th-divide)]" />
          <IconButton
            danger
            label={stale ? "清理本地协作记录" : session.role === "owner" ? "结束共享" : "退出协作"}
            disabled={busy}
            onClick={() => setLeaving(true)}
          >
            {stale ? <Trash2 size={16} /> : <LogOut size={16} />}
          </IconButton>
        </div>
      </div>
      <div className="border-border-2 bg-bg-container flex flex-wrap items-center gap-x-1 gap-y-1.5 border-b px-4 py-2">
        {session.members.map(member => (
          <span
            key={member.deviceId}
            className="hover:border-border-2 hover:bg-bg-elevated group inline-flex items-center gap-2 rounded-full border border-transparent px-1 py-0.5 transition duration-150"
            title={member.deviceId}
          >
            <Avatar id={member.deviceId} name={member.nickname} online={member.online} size={20} />
            <span className="max-w-[10em] overflow-hidden text-ellipsis whitespace-nowrap text-xs">
              {member.nickname}
            </span>
            <small
              className={`text-[11px] ${
                member.role === "owner"
                  ? "text-text-3"
                  : member.online && member.activity === "editing"
                    ? "text-status-success"
                    : "text-text-3"
              }`}
            >
              {member.role === "owner" ? "作者" : memberActivity(member)}
            </small>
            {session.role === "owner" && member.role !== "owner" && session.status === "active" && (
              <IconButton
                danger
                label={`移除 ${member.nickname}`}
                className="opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
                disabled={busy}
                onClick={() =>
                  run(() => invoke("collaboration:remove-member", session.id, member.deviceId))
                }
              >
                <UserMinus size={12} />
              </IconButton>
            )}
          </span>
        ))}
      </div>
      {binding && article ? (
        <div className="mx-auto box-border w-full min-w-0 max-w-[960px] flex-1 overflow-y-auto px-11 pb-[120px] pt-7 max-[760px]:px-5 max-[760px]:pb-[90px] max-[760px]:pt-4">
          <input
            className="placeholder:text-text-3 mb-7 block w-full border-0 bg-transparent text-[28px] font-[650] text-inherit outline-none max-[760px]:text-[22px]"
            aria-label="共享名称"
            value={article.title}
            readOnly={readonly}
            maxLength={500}
            placeholder="未命名内容"
            onChange={event =>
              binding.doc.transact(
                () => replaceText(binding.doc.getText("title"), event.target.value),
                binding.origin
              )
            }
          />
          <CollaborationEditor binding={binding} readonly={readonly} />
        </div>
      ) : (
        <div className="text-text-3 flex flex-1 items-center justify-center p-6 text-[13px]">
          {displayError || <LoadingOutlined spin />}
        </div>
      )}
      <CustomModal
        open={leaving}
        onCancel={() => setLeaving(false)}
        title={
          stale
            ? "清理本地协作记录？"
            : session.status === "closed"
              ? "清理协作缓存？"
              : session.role === "owner"
                ? "结束共享？"
                : "退出协作？"
        }
        subtitle={
          stale
            ? "旧协作服务器当前不可达。当前缓存内容会先保留到本地，然后删除本机的共享记录；原内容不会删除。"
            : session.pending
              ? "仍有未同步改动，请等待同步完成后退出，或选择丢弃改动。"
              : session.role === "owner"
                ? "所有成员将停止协作，服务器上的正文与附件会被清理，原内容保留在本机。"
                : "这段内容将从协作区移除，已保存的本地内容不受影响。"
        }
        okText={
          stale
            ? "清理记录"
            : session.pending && session.role !== "owner" && session.status !== "closed"
              ? "丢弃改动并退出"
              : session.status === "closed"
                ? "清理"
                : session.role === "owner"
                  ? "结束共享"
                  : "退出"
        }
        okButtonProps={{
          disabled:
            !stale && session.pending && session.role === "owner" && session.status === "active",
          className: "bg-status-error!",
        }}
        onOk={async () => {
          await run(() =>
            invoke(
              stale ? "collaboration:discard-local" : "collaboration:leave",
              session.id,
              session.pending
            )
          );
          setLeaving(false);
        }}
      />
    </main>
  );
}
