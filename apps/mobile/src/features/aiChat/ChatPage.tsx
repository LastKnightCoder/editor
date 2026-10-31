// 对话页：二级页面（隐藏 Dock）。新对话首条消息发出时才建会话；副标题是当前模型，点按只为本会话切换。
// 带来源内容时是就近对话：顶部原文条，输入框上方预置整篇 / 选中片段引用与快捷问法。

import { useEffect, useState } from "react";
import type { MentionRef } from "@tau/shared/chat-core";
import { ChevronDown, CircleAlert, History, SquarePen } from "lucide-react";
import { PortalScope } from "@tau/ui";
import { PageHeader, PageHeaderButton } from "../../components/PageHeader";
import { useNavigator } from "../../router";
import { modelLabel } from "../../services/ai-settings";
import { stopRun } from "../../services/aiChat/chatController";
import { ModelPickerSheet } from "../settings/ai/AiUi";
import { ChatComposer } from "./ChatComposer";
import { ChatEmpty, ChatSetup } from "./ChatEmpty";
import { ChatMessages } from "./ChatMessages";
import { describeChatError } from "./chatErrors";
import {
  CONTENT_KIND_TITLE,
  mentionOf,
  QUOTE_PROMPTS,
  WHOLE_PROMPTS,
  type ContentChatTarget,
} from "./contentChat";
import { useMessageActions } from "./MessageActions";
import { SourceBar } from "./SourceBar";
import { useChatSession } from "./useChatSession";

export function ChatPage(props: {
  sessionId: string;
  isNew: boolean;
  prompt?: string;
  /** 就近对话的来源内容 */
  content?: ContentChatTarget;
}) {
  const navigator = useNavigator();
  const { content } = props;
  const {
    databaseName,
    chat,
    providers,
    model,
    modelInfo,
    running,
    loadError,
    thinking,
    send,
    pickModel,
  } = useChatSession({
    sessionId: props.sessionId,
    isNew: props.isNew,
    ...(content && {
      domain: { contentId: content.contentId, title: content.title || "未命名" },
    }),
  });
  const [mentions, setMentions] = useState<MentionRef[]>(() =>
    content ? [mentionOf(content)] : []
  );
  const [picking, setPicking] = useState(false);
  const actions = useMessageActions(props.sessionId, thinking.level);

  // 从首页问答条带着问题进来：自动发出
  const [promptSent, setPromptSent] = useState(false);
  useEffect(() => {
    if (props.prompt && model && !promptSent && props.isNew) {
      setPromptSent(true);
      void send(props.prompt);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.prompt, model]);

  const openSettings = () => navigator.push("settingsModule", { module: "ai-models" });
  const error = chat?.error ? describeChatError(chat.error) : null;
  return (
    <PortalScope>
      <div className="mobile-kb-screen bg-page fixed inset-0 z-50 flex flex-col">
        <PageHeader
          onBack={() => void navigator.goBack("ui")}
          center={
            <button
              type="button"
              disabled={!providers.length}
              onClick={() => setPicking(true)}
              className="flex max-w-full flex-col items-center"
            >
              <span className="text-ink-1 max-w-full truncate text-[16px] font-bold">
                {content
                  ? CONTENT_KIND_TITLE[content.entityType]
                  : chat?.title && chat.title !== "新对话"
                    ? chat.title
                    : "新对话"}
              </span>
              {model && (
                <span className="text-ink-2 text-tau-sm flex max-w-full items-center gap-1">
                  <span className="bg-ok h-1.5 w-1.5 shrink-0 rounded-full" aria-hidden="true" />
                  <span className="truncate">
                    {modelInfo ? modelLabel(modelInfo) : model.modelId}
                  </span>
                  <ChevronDown size={12} className="shrink-0" aria-hidden="true" />
                </span>
              )}
            </button>
          }
          actions={
            <>
              <PageHeaderButton
                icon={<History size={20} />}
                aria-label="对话记录"
                className="text-ink-2 [&_svg]:stroke-2"
                onClick={() => navigator.push("aiChatHistory", {})}
              />
              {!content && (
                <PageHeaderButton
                  icon={<SquarePen size={19} />}
                  className="text-ink-2 [&_svg]:stroke-2"
                  disabled={!chat?.messages.length}
                  aria-label="新对话"
                  onClick={() =>
                    navigator.replace("aiChat", { sessionId: crypto.randomUUID(), isNew: "1" })
                  }
                />
              )}
            </>
          }
        />
        {content && (
          <SourceBar contentId={content.contentId} title={content.title} quote={content.quote} />
        )}
        {!model ? (
          <div className="flex-1 overflow-y-auto px-4">
            <ChatSetup hasProvider={providers.length > 0} onSetup={openSettings} />
          </div>
        ) : (
          <>
            <ChatMessages
              messages={chat?.messages ?? []}
              running={running}
              empty={
                content ? (
                  <p className="text-ink-3 text-tau-meta px-6 pt-10 text-center leading-relaxed">
                    {content.quote ? "问问选中的这段，或用下面的快捷问法。" : "问问这篇内容。"}
                  </p>
                ) : (
                  <ChatEmpty onPick={text => void send(text)} />
                )
              }
              onAction={actions.onAction}
              onMenu={actions.onMenu}
            />
            {(error || loadError) && (
              <div
                role="alert"
                className="bg-danger-soft text-tau-meta mx-4 mb-1 flex items-start gap-2.5 rounded-2xl px-3.5 py-2.5"
              >
                <CircleAlert size={16} className="text-danger mt-0.5 shrink-0" aria-hidden="true" />
                <span className="text-ink-2 min-w-0 flex-1 leading-relaxed">
                  <b className="text-ink-1 text-tau-body block font-semibold">
                    {error?.title ?? "对话读取失败"}
                  </b>
                  {error?.detail ?? loadError}
                </span>
                {error?.action === "settings" && (
                  <button
                    type="button"
                    onClick={openSettings}
                    className="text-accent-text self-center font-semibold"
                  >
                    去检查
                  </button>
                )}
                {error?.action === "model" && (
                  <button
                    type="button"
                    onClick={() => setPicking(true)}
                    className="text-accent-text self-center font-semibold"
                  >
                    换模型
                  </button>
                )}
              </div>
            )}
            <ChatComposer
              key={databaseName}
              databaseName={databaseName}
              running={running}
              disabled={!!loadError}
              imageInput={!!modelInfo?.input.includes("image")}
              {...(thinking.level && {
                thinking: {
                  level: thinking.level,
                  options: thinking.options,
                  onPick: thinking.pick,
                },
              })}
              {...(content && {
                placeholder: "问问这段内容…",
                mentions,
                onMentionsChange: setMentions,
                quickPrompts: content.quote ? QUOTE_PROMPTS : WHOLE_PROMPTS,
              })}
              onSend={input => void send(input)}
              onStop={() => void stopRun(props.sessionId)}
            />
          </>
        )}
        {actions.sheets}
        <ModelPickerSheet
          open={picking}
          title="本次对话使用的模型"
          description="只影响这段对话；默认模型在「我的 › AI 模型」里设置。"
          providers={providers}
          value={model}
          clearable={false}
          onSelect={next => {
            pickModel(next);
            setPicking(false);
          }}
          onOpenProvider={providerId => {
            setPicking(false);
            navigator.push("aiProvider", { providerId });
          }}
          onClose={() => setPicking(false)}
        />
      </div>
    </PortalScope>
  );
}
