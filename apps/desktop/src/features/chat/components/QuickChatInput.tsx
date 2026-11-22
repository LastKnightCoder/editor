import { useEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { ArrowUp, X } from "lucide-react";
import { IconButton, Spinner, toast, usePortalContainer } from "@tau/ui";
import type { QuickChatTarget } from "@/app/assistOwner";
import { useOverlayDismiss } from "@/page/PageProvider";
import { isMac } from "@/platform";
import { Role } from "@/constants";
import { getChatDatabase } from "@/services/chatDatabase";
import { createChatMessageClientId } from "@/services/chatMessageSchema";
import { createAssistantMessage } from "@/services/assistantMessageBlocks";
import { piChatSessionManager } from "@/services/piChatSession";
import { piChatRuntime } from "@/services/piChatRuntime";
import { currentWhiteboardToolScope } from "@/services/whiteboard-documents/agent-scope";
import useChatSessionStore, {
  bucketOfChatScope,
  createDraftChat,
} from "@/stores/useChatSessionStore";
import { prepareChatSession } from "@/components/ChatSidebar/hooks/prepareChatSession";
import { useChatModelConfig } from "@/components/ChatSidebar/hooks/useChatModelConfig";
import { useChatRuntime } from "@/components/ChatSidebar/hooks/useChatRuntime";
import { submitQuickChatPrompt } from "../quickChatPrompt";

export default function QuickChatInput({
  target,
  input,
  onClose,
}: {
  target: QuickChatTarget;
  input: RefObject<HTMLTextAreaElement | null>;
  onClose(): void;
}) {
  const bucket = bucketOfChatScope(target.chatScope);
  const [draft, setDraft] = useState(() => createDraftChat(bucket));
  if (draft.scope !== bucket.scope || draft.domainRef !== bucket.domainRef) {
    setDraft(createDraftChat(bucket));
  }
  const chat = useChatSessionStore(s => s.opened[draft.id] ?? draft);
  const model = useChatModelConfig();
  const { sessionKey, actualChatRef } = useChatRuntime({
    ...model,
    currentChat: chat,
    chatScope: target.chatScope,
  });
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const portal = usePortalContainer();
  const active = useRef<string | null>(null);
  useEffect(() => {
    active.current = draft.id;
    input.current?.focus({ preventScroll: true });
    return () => {
      active.current = null;
    };
  }, [input, draft.id]);
  const dismiss = () => {
    if (!submitting.current) onClose();
  };
  useOverlayDismiss(dismiss);

  const send = async () => {
    if (submitting.current || !text.trim()) return;
    const stillHere = () => active.current === draft.id && draft.databaseName === getChatDatabase();
    submitting.current = true;
    setBusy(true);
    setError("");
    let prepared = false;
    let registered = false;
    let accepted = false;
    try {
      target.beforeSend?.();
      const tools =
        target.toolScope ??
        (target.chatScope === "main-chat" ? currentWhiteboardToolScope() : undefined);
      const session = await prepareChatSession(draft, {
        ...model,
        ...target,
        toolScope: tools,
      });
      prepared = true;
      if (!stillHere()) return;
      if (!session.sessionFile) throw new Error("新对话未能创建");
      const row = await useChatSessionStore.getState().registerChat(draft, session.sessionFile);
      actualChatRef.current = { ...draft, sessionFile: row.sessionFile };
      registered = true;
      if (!stillHere()) return;
      const display = {
        content: [{ type: "text" as const, text }],
        clientId: createChatMessageClientId(),
      };
      actualChatRef.current = {
        ...actualChatRef.current,
        messages: [{ ...display, role: Role.User }, createAssistantMessage()],
      };
      piChatRuntime.bindSession(sessionKey, session.sessionId);
      await submitQuickChatPrompt(session.sessionId, text, display, () => {
        accepted = true;
        useChatSessionStore.getState().publishChat(actualChatRef.current);
        if (stillHere()) {
          target.show(draft.id);
          onClose();
        }
      });
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : "发送失败";
      if (accepted) toast.error(reason);
      else if (stillHere()) {
        setError(reason);
        input.current?.focus();
      }
    } finally {
      if (prepared && !accepted) {
        // 只回收本次新建且未接收首条消息的会话；重试使用独立草稿。
        try {
          await piChatSessionManager.disposeByKey(sessionKey);
          if (registered)
            await useChatSessionStore.getState().deleteChat(draft.id, draft.databaseName);
        } catch (cause) {
          toast.error(cause instanceof Error ? cause.message : "清理未发送的对话失败");
        }
        piChatRuntime.disposeConversation(sessionKey);
        if (stillHere()) setDraft(createDraftChat(bucket));
      }
      submitting.current = false;
      if (active.current) setBusy(false);
    }
  };

  // 没写内容时点别处即收起；写了内容只认 Esc 与关闭按钮，免得误触丢字
  const form = useRef<HTMLFormElement>(null);
  const empty = !text.trim();
  useEffect(() => {
    if (!empty) return;
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !form.current?.contains(event.target)) dismiss();
    };
    window.addEventListener("pointerdown", onPointerDown, true);
    return () => window.removeEventListener("pointerdown", onPointerDown, true);
  });

  return createPortal(
    <form
      ref={form}
      aria-label="快捷对话"
      aria-busy={busy}
      onSubmit={event => {
        event.preventDefault();
        void send();
      }}
      className="bg-surface border-line-1 shadow-float rounded-tau-lg ease-tau-out fixed inset-x-4 bottom-5 z-[330] mx-auto max-w-[620px] border p-3 transition-[opacity,translate] duration-200 starting:translate-y-2 starting:opacity-0"
    >
      <textarea
        ref={input}
        aria-label="新对话消息"
        placeholder={target.placeholder ?? "问点什么，回答会在右栏的新对话里继续"}
        value={text}
        readOnly={busy}
        rows={1}
        onChange={event => setText(event.target.value)}
        onKeyDown={event => {
          if (
            event.nativeEvent.isComposing ||
            event.key !== "Enter" ||
            !(event.metaKey || event.ctrlKey) ||
            event.altKey ||
            event.shiftKey
          )
            return;
          event.preventDefault();
          event.stopPropagation();
          void send();
        }}
        className="text-ink-1 placeholder:text-ink-3 text-tau-body block field-sizing-content max-h-[40vh] min-h-[44px] w-full resize-none bg-transparent px-2 py-1 outline-none"
      />
      <div className="text-tau-meta text-ink-3 mt-1 flex items-center gap-2 pl-2">
        {error ? (
          <span role="alert" className="text-danger min-w-0 truncate" title={error}>
            {error}
          </span>
        ) : busy ? (
          <span>正在发送…</span>
        ) : (
          <span className="flex items-center gap-2.5">
            <Hint keys={isMac ? "⌘↵" : "Ctrl Enter"} label="发送" />
            <Hint keys="Esc" label="关闭" />
          </span>
        )}
        <div className="flex-1" />
        <IconButton
          type="button"
          aria-label="关闭快捷输入"
          title="关闭 (Esc)"
          disabled={busy}
          onClick={dismiss}
        >
          <X size={15} />
        </IconButton>
        <IconButton
          type="submit"
          aria-label="发送"
          title="发送"
          disabled={!text.trim() || busy}
          className="bg-accent text-ink-inverse enabled:hover:bg-accent-hover enabled:hover:text-ink-inverse"
        >
          {busy ? <Spinner /> : <ArrowUp size={16} />}
        </IconButton>
      </div>
    </form>,
    portal
  );
}

function Hint({ keys, label }: { keys: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <kbd className="bg-hover text-tau-tiny text-ink-2 inline-flex h-[18px] items-center rounded-[5px] px-1.5 font-mono">
        {keys}
      </kbd>
      {label}
    </span>
  );
}
