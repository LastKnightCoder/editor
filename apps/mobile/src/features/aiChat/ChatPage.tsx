// 对话页：二级页面（隐藏 Dock）。新对话首条消息发出时才建会话；副标题是当前模型，点按只为本会话切换。

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, CircleAlert, History, SquarePen } from "lucide-react";
import { PortalScope } from "@tau/ui";
import type { LLMUsageConfigV2 } from "@tau/ai/models";
import { PageHeader, PageHeaderButton } from "../../components/PageHeader";
import { useAppContext } from "../../app/AppContext";
import { useNavigator } from "../../router";
import { findAssignedModel, modelLabel } from "../../services/ai-settings";
import {
  createChat,
  openChat,
  sendMessage,
  setChatModel,
  stopRun,
  useChatStore,
} from "../../services/aiChat/chatController";
import { ModelPickerSheet } from "../settings/ai/AiUi";
import { ChatComposer } from "./ChatComposer";
import { ChatEmpty, ChatSetup } from "./ChatEmpty";
import { ChatMessages } from "./ChatMessages";
import { describeChatError } from "./chatErrors";
import { ensureChatInteractions } from "./interactions";

export function ChatPage(props: { sessionId: string; isNew: boolean; prompt?: string }) {
  const navigator = useNavigator();
  const setting = useAppContext().syncSettings.safeSetting;
  const databaseName = setting?.database?.active ?? "";
  const providers = setting?.llmProviders ?? [];
  const assigned = findAssignedModel(setting, "chat");
  const defaultModel = useMemo(
    () => (assigned ? { providerId: assigned.provider.id, modelId: assigned.model.id } : null),
    [assigned]
  );
  const chat = useChatStore(state => state.chats[props.sessionId]);
  const [loadError, setLoadError] = useState("");
  const [picking, setPicking] = useState(false);
  const [created, setCreated] = useState(!props.isNew);
  // 会话建好前临时选的模型；建好后以会话状态里的为准
  const [override, setOverride] = useState<LLMUsageConfigV2 | null>(null);
  const model = chat?.model ?? override ?? defaultModel;
  const modelInfo = useMemo(() => {
    const provider = providers.find(item => item.id === model?.providerId);
    return provider?.models.find(item => item.id === model?.modelId);
  }, [providers, model]);
  const running = !!chat?.runId;

  useEffect(() => {
    ensureChatInteractions();
  }, []);
  useEffect(() => {
    if (props.isNew || !databaseName) return;
    openChat(databaseName, props.sessionId, defaultModel).catch(error =>
      setLoadError(error instanceof Error ? error.message : "对话读取失败")
    );
    // 只在进入页面时读取一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.sessionId, databaseName]);

  const send = async (text: string) => {
    if (!model || !databaseName) return;
    if (!created) {
      try {
        await createChat(databaseName, props.sessionId, model);
        setCreated(true);
      } catch (error) {
        setLoadError(error instanceof Error ? error.message : "对话创建失败");
        return;
      }
    }
    await sendMessage(props.sessionId, text);
  };

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
  const pickModel = (next: LLMUsageConfigV2 | null) => {
    if (!next) return;
    if (chat) setChatModel(props.sessionId, next);
    else setOverride(next);
    setPicking(false);
  };

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
              onSend={text => void send(text)}
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
          onSelect={pickModel}
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
