// 内容页的半屏就近对话：两档高度（约 55% / 全屏），下拉关闭；「展开」推入全屏对话页，会话不变。
// 同一篇内容再次打开时续上最近一次就近对话；首次打开在首条消息发出时才建会话。

import { useEffect, useState } from "react";
import { Maximize2, Sparkles, X } from "lucide-react";
import type { MentionRef } from "@tau/shared/chat-core";
import { SnapSheet, type SnapSheetState } from "../../components/SnapSheet";
import { useAppContext } from "../../app/AppContext";
import { useNavigator } from "../../router";
import { findContentChat, stopRun, useChatStore } from "../../services/aiChat/chatController";
import { ChatComposer } from "./ChatComposer";
import { ChatSetup } from "./ChatEmpty";
import { ChatMessages } from "./ChatMessages";
import { describeChatError } from "./chatErrors";
import { useChatSession } from "./useChatSession";

export interface ContextChatTarget {
  contentId: number;
  entityType: MentionRef["entityType"];
  entityId: number;
  title: string;
  /** 选中的原文；缺省表示整篇提问 */
  quote?: string;
}

const KIND_TITLE: Record<MentionRef["entityType"], string> = {
  card: "关于这张卡片",
  article: "关于这篇文章",
  "project-item": "关于这篇文档",
  diary: "关于这篇日记",
};

const QUOTE_PROMPTS = ["解释这段", "总结这段", "翻译成英文"];
const WHOLE_PROMPTS = ["总结这篇", "列出要点", "出几道问答题帮我复习"];

function mentionOf(target: ContextChatTarget): MentionRef {
  return {
    entityType: target.entityType,
    entityId: target.entityId,
    contentId: target.contentId,
    title: target.title,
    previewText: target.quote ?? "",
    ...(target.quote ? { quote: true } : {}),
  };
}

function SheetBody(props: {
  target: ContextChatTarget;
  sessionId: string;
  isNew: boolean;
  onExpand(): void;
  onClose(): void;
}) {
  const navigator = useNavigator();
  const { target } = props;
  const session = useChatSession({
    sessionId: props.sessionId,
    isNew: props.isNew,
    domain: { contentId: target.contentId, title: target.title || "未命名" },
  });
  const [mentions, setMentions] = useState<MentionRef[]>(() => [mentionOf(target)]);
  const error = session.chat?.error ? describeChatError(session.chat.error) : null;

  return (
    <>
      <SnapSheet.Handle />
      <header className="flex shrink-0 items-center gap-1.5 pr-2 pb-1.5 pl-[18px]">
        <Sparkles size={16} className="text-accent shrink-0" aria-hidden="true" />
        <span className="text-ink-1 min-w-0 flex-1 truncate text-[15px] font-bold">
          {KIND_TITLE[target.entityType]}
        </span>
        <button
          type="button"
          aria-label="展开为全屏对话"
          onClick={props.onExpand}
          className="text-ink-2 active:bg-press grid h-9 w-9 place-items-center rounded-[11px]"
        >
          <Maximize2 size={17} aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label="关闭"
          onClick={props.onClose}
          className="text-ink-2 active:bg-press grid h-9 w-9 place-items-center rounded-[11px]"
        >
          <X size={18} aria-hidden="true" />
        </button>
      </header>
      {!session.model ? (
        <SnapSheet.Scroll className="px-4">
          <ChatSetup
            hasProvider={session.providers.length > 0}
            onSetup={() => {
              props.onClose();
              navigator.push("settingsModule", { module: "ai-models" });
            }}
          />
        </SnapSheet.Scroll>
      ) : (
        <>
          <ChatMessages
            messages={session.chat?.messages ?? []}
            running={session.running}
            empty={
              <p className="text-ink-3 text-tau-meta px-6 pt-6 text-center leading-relaxed">
                {target.quote ? "问问选中的这段，或用下面的快捷问法。" : "问问这篇内容。"}
              </p>
            }
          />
          {(error || session.loadError) && (
            <p role="alert" className="text-danger text-tau-sm px-5 pb-1">
              {error ? `${error.title}：${error.detail}` : session.loadError}
            </p>
          )}
          <ChatComposer
            running={session.running}
            disabled={!!session.loadError}
            placeholder="问问这段内容…"
            imageInput={!!session.modelInfo?.input.includes("image")}
            mentions={mentions}
            onMentionsChange={setMentions}
            quickPrompts={target.quote ? QUOTE_PROMPTS : WHOLE_PROMPTS}
            onSend={input => void session.send(input)}
            onStop={() => void stopRun(props.sessionId)}
          />
        </>
      )}
    </>
  );
}

export function ContextChatSheet(props: { target: ContextChatTarget | null; onClose(): void }) {
  const navigator = useNavigator();
  const databaseName = useAppContext().syncSettings.safeSetting?.database?.active ?? "";
  const [state, setState] = useState<SnapSheetState>("normal");
  const [session, setSession] = useState<{ id: string; isNew: boolean } | null>(null);
  const { target } = props;

  // 每次打开：续上这篇最近一次就近对话，没有就准备一个新会话 id
  useEffect(() => {
    if (!target || !databaseName) return setSession(null);
    let active = true;
    setState("normal");
    findContentChat(databaseName, target.contentId)
      .then(found => {
        if (active)
          setSession(
            found ? { id: found.id, isNew: false } : { id: crypto.randomUUID(), isNew: true }
          );
      })
      .catch(() => {
        if (active) setSession({ id: crypto.randomUUID(), isNew: true });
      });
    return () => {
      active = false;
    };
  }, [target, databaseName]);

  return (
    <SnapSheet
      open={!!target && !!session}
      state={state}
      states={["normal", "full"]}
      normalHeight={0.56}
      onStateChange={next => setState(next)}
      onClose={props.onClose}
    >
      {target && session ? (
        <div className="flex h-full min-h-0 flex-col">
          <SheetBody
            key={`${session.id}:${target.quote ?? ""}`}
            target={target}
            sessionId={session.id}
            isNew={session.isNew}
            onClose={props.onClose}
            onExpand={() => {
              // 还没发过消息时没有会话可延续，全屏打开一个普通新对话即可
              const started = !!useChatStore.getState().chats[session.id];
              props.onClose();
              navigator.push(
                "aiChat",
                started ? { sessionId: session.id } : { sessionId: crypto.randomUUID(), isNew: "1" }
              );
            }}
          />
        </div>
      ) : (
        <div />
      )}
    </SnapSheet>
  );
}
