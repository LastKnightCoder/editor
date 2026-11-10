/**
 * 对话里的提问卡：Agent 在某篇正文的一段原句上问你，给几个可点的答案；
 * 作答留在发起提问的对话中。
 */

import { FileText } from "lucide-react";
import { ToolCard, ToolCardBody, ToolCardHeader, ToolMutedText } from "@tau/chat-ui";
import { AgentAvatar, AgentName } from "@/components/AgentIdentity/AgentAvatar";
import { SuggestionCard, agentNameOf, useSuggestionActions } from "@/components/ContentReview";
import {
  openSuggestionTarget,
  targetLabel,
  useSuggestionTarget,
} from "@/components/ContentReview/target";
import { questionProposalId } from "@/services/content-editing/questions";
import { useProposalSuggestions } from "@/services/content-editing/suggestion-queries";
import useSettingStore from "@/stores/useSettingStore";
import { formatAgo } from "@/utils/formatAgo";
import type { ToolCallCustomRendererProps } from "./types";

const parseError = (output?: string) => {
  if (!output) return undefined;
  try {
    const parsed = JSON.parse(output) as { success?: boolean; message?: string };
    return parsed.success === false ? parsed.message : undefined;
  } catch {
    return undefined;
  }
};

const ContentQuestionRenderer = ({ execution, isDark }: ToolCallCustomRendererProps) => {
  const database = useSettingStore(state => state.setting.database.active);
  const { data: items } = useProposalSuggestions(
    questionProposalId(execution.toolCallId),
    database
  );
  const item = items?.find(entry => entry.kind === "question");
  const { data: target } = useSuggestionTarget(item?.contentId, database);
  const actions = useSuggestionActions(database);

  if (!item) {
    const error = parseError(execution.output);
    return (
      <ToolCard isDark={isDark}>
        <ToolCardHeader isDark={isDark}>
          <div className="text-tau-body text-ink-1 font-medium">在正文里提问</div>
          <ToolMutedText isDark={isDark} className="mt-1 mb-2">
            {error ?? (execution.status === "success" ? "这个问题的记录已清理。" : "正在准备问题…")}
          </ToolMutedText>
        </ToolCardHeader>
      </ToolCard>
    );
  }
  const agent = agentNameOf(item);
  return (
    <ToolCard isDark={isDark}>
      <ToolCardHeader isDark={isDark}>
        <div className="text-tau-body flex flex-wrap items-center gap-x-1.5 gap-y-1">
          <AgentAvatar
            name={agent}
            size={20}
            status={item.status === "pending" ? "waiting" : undefined}
          />
          <AgentName name={agent} />
          <span className="text-ink-3">在</span>
          <button
            type="button"
            className="text-accent-text inline-flex min-w-0 cursor-pointer items-center gap-1 hover:underline"
            onClick={() => openSuggestionTarget(target, item.id)}
          >
            <FileText size={13} strokeWidth={1.75} className="shrink-0" />
            <span className="max-w-[16em] truncate">{targetLabel(target)}</span>
          </button>
          <span className="text-ink-3">{item.status === "pending" ? "问你" : "问过你"}</span>
          <span className="text-tau-micro text-ink-3 ml-auto tabular-nums">
            {formatAgo(item.createdAt)}
          </span>
        </div>
      </ToolCardHeader>
      <ToolCardBody>
        <div className="border-line-1 rounded-tau-sm border px-3 py-2.5">
          <SuggestionCard item={item} actions={actions} />
        </div>
      </ToolCardBody>
    </ToolCard>
  );
};

export default ContentQuestionRenderer;
