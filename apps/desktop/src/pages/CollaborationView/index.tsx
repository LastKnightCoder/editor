import { useEffect, useState } from "react";
import { App } from "antd";
import { Check, KeyRound, Settings, Share2, Users, X } from "lucide-react";
import { invoke } from "@/electron";
import useCollaborationStore, {
  initializeCollaborationStore,
} from "@/stores/useCollaborationStore";
import SharedContentEditor from "./SharedContentEditor";
import { sessionStatus } from "./session-status";
import ShareContentDialog from "./ShareContentDialog";
import { Avatar, AvatarStack, IconButton } from "@/components/CollaborationUI";
import CollaborationSettingsDialog from "./CollaborationSettingsDialog";

export default function CollaborationView() {
  const state = useCollaborationStore();
  const { message } = App.useApp();
  const [code, setCode] = useState("");
  const [joining, setJoining] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [contentPickerOpen, setContentPickerOpen] = useState(false);
  useEffect(() => {
    initializeCollaborationStore();
  }, []);
  const session = state.sessions.find(item => item.id === state.selectedId) || state.sessions[0];
  const run = async (action: () => Promise<unknown>) => {
    try {
      await action();
    } catch (error) {
      message.error(error instanceof Error ? error.message : "操作失败");
    }
  };
  return (
    <div className="bg-bg-page text-text-1 flex h-full min-h-0">
      <aside className="border-border-1 bg-bg-container flex w-72 min-w-72 flex-col gap-1 overflow-y-auto border-r pb-4 max-[760px]:w-56 max-[760px]:min-w-56">
        <header className="flex items-center gap-2.5 px-4 pb-3 pt-4">
          <Avatar id={state.deviceId || "local"} name={state.nickname} size={30} />
          <div className="min-w-0 flex-1">
            <h1 className="m-0 text-base font-[650] leading-tight">协作</h1>
            <p
              className="text-text-3 mt-px overflow-hidden text-ellipsis whitespace-nowrap text-xs"
              title={state.nickname}
            >
              {state.nickname}
            </p>
          </div>
          <IconButton label="协作设置" onClick={() => setSettingsOpen(true)}>
            <Settings size={16} />
          </IconButton>
        </header>
        <form
          className="flex gap-1.5 px-4 py-1"
          onSubmit={event => {
            event.preventDefault();
            if (!code.trim()) return;
            setJoining(true);
            void run(async () => {
              await invoke("collaboration:join", code.trim());
              setCode("");
              message.success("加入申请已提交，等待作者批准");
            }).finally(() => setJoining(false));
          }}
        >
          <div className="border-border-1 bg-bg-input text-text-3 flex h-9 min-w-0 flex-1 items-center gap-2 rounded-[10px] border px-2.5 transition duration-150 focus-within:border-[var(--th-border-focus)] focus-within:shadow-[var(--th-focus-ring)]">
            <KeyRound size={14} />
            <input
              aria-label="协作码"
              placeholder="输入协作码加入"
              value={code}
              maxLength={32}
              className="text-text-1 placeholder:text-text-3 min-w-0 flex-1 border-0 bg-transparent font-mono text-[13px] outline-none placeholder:font-sans"
              onChange={event => setCode(event.target.value)}
            />
          </div>
          <button
            type="submit"
            className="bg-brand hover:bg-brand-hover h-9 shrink-0 cursor-pointer rounded-[10px] border-0 px-3.5 text-[13px] font-medium text-white transition duration-150 ease-out active:scale-[0.97] disabled:cursor-default disabled:opacity-45"
            disabled={joining || !code.trim()}
            aria-label="申请加入"
          >
            加入
          </button>
        </form>
        <button
          type="button"
          className="border-border-2 text-text-2 hover:bg-active hover:text-active-text mx-4 my-1.5 flex h-9 cursor-pointer items-center justify-center gap-2 rounded-[10px] border border-dashed bg-transparent text-[13px] transition duration-150 hover:border-solid hover:border-[var(--th-border-focus)]"
          onClick={() => setContentPickerOpen(true)}
        >
          <Share2 size={14} />
          共享本地内容
        </button>
        {state.error && (
          <div className="text-status-error mx-4 mb-2 rounded-lg bg-[color-mix(in_oklab,var(--th-danger)_9%,transparent)] px-3 py-2 text-xs leading-relaxed [overflow-wrap:anywhere]">
            {state.error}
          </div>
        )}
        {state.requests.length > 0 && (
          <section className="mx-4 mt-2 rounded-xl bg-[color-mix(in_oklab,var(--th-warning)_8%,transparent)] p-2">
            <h2 className="text-text-3 mb-1 flex items-center gap-1.5 px-1.5 pt-0.5 text-[11px] font-semibold uppercase tracking-[0.05em]">
              待审批
              <span className="text-status-warning rounded-full bg-[color-mix(in_oklab,var(--th-warning)_14%,transparent)] px-1.5 text-[10px] leading-[17px]">
                {state.requests.length}
              </span>
            </h2>
            {state.requests.map(request => (
              <div key={request.id} className="flex items-center gap-2.5 rounded-lg px-1.5 py-2">
                <Avatar id={request.deviceId} name={request.nickname} size={26} />
                <div className="min-w-0 flex-1">
                  <strong className="block overflow-hidden text-ellipsis whitespace-nowrap text-[13px] font-medium">
                    {request.nickname}
                  </strong>
                  <small className="text-text-3 block overflow-hidden text-ellipsis whitespace-nowrap text-[11px]">
                    {state.sessions.find(item => item.id === request.documentId)?.title ||
                      "共享内容"}
                  </small>
                </div>
                <IconButton
                  tone="success"
                  label="批准"
                  onClick={() => run(() => invoke("collaboration:decide", request.id, true))}
                >
                  <Check size={14} />
                </IconButton>
                <IconButton
                  danger
                  label="拒绝"
                  onClick={() => run(() => invoke("collaboration:decide", request.id, false))}
                >
                  <X size={14} />
                </IconButton>
              </div>
            ))}
          </section>
        )}
        {(["owner", "editor"] as const).map(role => {
          const items = state.sessions.filter(item => item.role === role);
          if (!items.length) return null;
          return (
            <section className="border-border-2 mt-1.5 border-t px-2 py-2.5" key={role}>
              <h2 className="text-text-3 mb-1.5 flex items-center gap-1.5 px-2 text-[11px] font-semibold uppercase tracking-[0.05em]">
                {role === "owner" ? "我发起的" : "我加入的"}
              </h2>
              {items.map(item => {
                const status = sessionStatus(item);
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`hover:bg-hover relative flex w-full cursor-pointer items-center gap-2.5 rounded-lg border-0 bg-transparent px-2 py-2 text-left text-inherit transition duration-150 ${
                      session?.id === item.id ? "bg-active" : ""
                    }`}
                    onClick={() => state.select(item.id)}
                  >
                    {session?.id === item.id && (
                      <i className="bg-brand absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-full" />
                    )}
                    <AvatarStack members={item.members} />
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <strong className="overflow-hidden text-ellipsis whitespace-nowrap text-[13px] font-medium">
                        {item.title || "未命名内容"}
                      </strong>
                      <small className="text-text-3 overflow-hidden text-ellipsis whitespace-nowrap text-[11px]">
                        {item.members.filter(member => member.online).length} 人在线 ·{" "}
                        {status.label}
                      </small>
                    </span>
                  </button>
                );
              })}
            </section>
          );
        })}
        {state.sessions.length === 0 && !state.requests.length && (
          <p className="text-text-3 mx-4 mt-2 text-xs leading-relaxed">
            还没有协作内容。输入别人的协作码加入，或把本地内容共享给其他设备。
          </p>
        )}
      </aside>
      {session ? (
        <SharedContentEditor key={session.id} session={session} />
      ) : (
        <main className="text-text-3 flex min-w-0 flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
          <div className="relative">
            <div className="bg-active absolute inset-0 -z-10 scale-[1.8] rounded-full opacity-70 blur-2xl" />
            <Users size={44} strokeWidth={1.2} />
          </div>
          <h3 className="text-text-2 m-0 mt-2 text-base font-semibold">开始实时协作</h3>
          <p className="m-0 max-w-xs text-[13px] leading-relaxed">
            在任意内容点击「发起协作」，或输入协作码加入他人的共享。
          </p>
        </main>
      )}
      <CollaborationSettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <ShareContentDialog
        open={contentPickerOpen}
        onClose={() => setContentPickerOpen(false)}
        onShared={state.select}
      />
    </div>
  );
}
