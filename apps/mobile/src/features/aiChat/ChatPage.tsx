// 对话页：二级页面（隐藏 Dock）。新对话首条消息发出时才建会话；副标题是当前模型，点按只为本会话切换。

import { useEffect, useState } from "react";
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
import { useChatSession } from "./useChatSession";

export function ChatPage(props: { sessionId: string; isNew: boolean; prompt?: string }) {
  const navigator = useNavigator();
  const { chat, providers, model, modelInfo, running, loadError, send, pickModel } = useChatSession(
    { sessionId: props.sessionId, isNew: props.isNew }
  );
  const [picking, setPicking] = useState(false);

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
              <span className="text-ink-1 max-w-full truncate text-[16px] font-extrabold">
                {chat?.title && chat.title !== "新对话" ? chat.title : "新对话"}
              </span>
              {model && (
                <span className="text-ink-3 text-tau-sm flex items-center gap-0.5">
                  {modelInfo ? modelLabel(modelInfo) : model.modelId}
                  <ChevronDown size={12} aria-hidden="true" />
                </span>
              )}
            </button>
          }
          actions={
            <>
              <PageHeaderButton
                icon={<History size={20} />}
                aria-label="对话记录"
                onClick={() => navigator.push("aiChatHistory", {})}
              />
              <PageHeaderButton
                icon={<SquarePen size={19} />}
                aria-label="新对话"
                onClick={() =>
                  navigator.replace("aiChat", { sessionId: crypto.randomUUID(), isNew: "1" })
                }
              />
            </>
          }
        />
        {!model ? (
          <div className="flex-1 overflow-y-auto px-4">
            <ChatSetup hasProvider={providers.length > 0} onSetup={openSettings} />
          </div>
        ) : (
          <>
            <ChatMessages
              messages={chat?.messages ?? []}
              running={running}
              empty={<ChatEmpty onPick={text => void send(text)} />}
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
              running={running}
              disabled={!!loadError}
              imageInput={!!modelInfo?.input.includes("image")}
              onSend={input => void send(input)}
              onStop={() => void stopRun(props.sessionId)}
            />
          </>
        )}
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
