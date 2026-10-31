// 对话页（含就近对话）：模型（默认分配 + 会话内临时切换）、思考强度、读取 / 首发建会话、发送。

import { useEffect, useMemo, useState } from "react";
import type { LLMUsageConfigV2 } from "@tau/ai/models";
import { useAppContext } from "../../app/AppContext";
import { findAssignedModel } from "../../services/ai-settings";
import {
  createChat,
  openChat,
  sendMessage,
  setChatModel,
  useChatStore,
  type ChatInput,
} from "../../services/aiChat/chatController";
import { ensureChatInteractions } from "./interactions";
import { useThinkingLevel } from "./useThinkingLevel";

export function useChatSession(options: {
  sessionId: string;
  /** 会话尚未建：首条消息发出时才建 */
  isNew: boolean;
  /** 就近对话的来源内容；建会话时记入作用域 */
  domain?: { contentId: number; title: string };
}) {
  const setting = useAppContext().syncSettings.safeSetting;
  const databaseName = setting?.database?.active ?? "";
  const providers = useMemo(() => setting?.llmProviders ?? [], [setting?.llmProviders]);
  const assigned = findAssignedModel(setting, "chat");
  const defaultModel = useMemo(
    () => (assigned ? { providerId: assigned.provider.id, modelId: assigned.model.id } : null),
    [assigned]
  );
  const chat = useChatStore(state => state.chats[options.sessionId]);
  const [loadError, setLoadError] = useState("");
  const [created, setCreated] = useState(!options.isNew);
  // 会话建好前临时选的模型；建好后以会话状态里的为准
  const [override, setOverride] = useState<LLMUsageConfigV2 | null>(null);
  const model = chat?.model ?? override ?? defaultModel;
  const modelInfo = useMemo(() => {
    const provider = providers.find(item => item.id === model?.providerId);
    return provider?.models.find(item => item.id === model?.modelId);
  }, [providers, model]);
  const thinking = useThinkingLevel(providers, model, modelInfo?.thinkingLevel);

  useEffect(() => {
    ensureChatInteractions();
  }, []);
  useEffect(() => {
    setCreated(!options.isNew);
    setLoadError("");
    if (options.isNew || !databaseName) return;
    openChat(databaseName, options.sessionId, defaultModel).catch(error =>
      setLoadError(error instanceof Error ? error.message : "对话读取失败")
    );
    // 只在会话变化时读取一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options.sessionId, options.isNew, databaseName]);

  const send = async (input: ChatInput | string) => {
    if (!model || !databaseName) return;
    if (!created) {
      try {
        await createChat(databaseName, options.sessionId, model, options.domain);
        setCreated(true);
      } catch (error) {
        setLoadError(error instanceof Error ? error.message : "对话创建失败");
        return;
      }
    }
    await sendMessage(options.sessionId, input, thinking.level);
  };

  const pickModel = (next: LLMUsageConfigV2 | null) => {
    if (!next) return;
    if (chat) setChatModel(options.sessionId, next);
    else setOverride(next);
  };

  return {
    databaseName,
    chat,
    providers,
    model,
    modelInfo,
    running: !!chat?.runId,
    loadError,
    thinking,
    send,
    pickModel,
  };
}
