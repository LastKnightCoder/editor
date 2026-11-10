/** 「交给 Agent」评论框：锚在选中的原文上，可点选这篇出现过的 Agent，发送后进入当前对话。 */

import { useState } from "react";
import { createPortal } from "react-dom";
import { AtSign, Send } from "lucide-react";
import { Button, Popover, Textarea, cn, toast } from "@tau/ui";
import { serializeMentionRef, type MentionRef } from "@tau/shared";
import { sendToChat } from "@/features/chat/chatSend";
import {
  permissionOf,
  useAgentPermissions,
  useContentSuggestions,
} from "@/services/content-editing/suggestion-queries";
import { useAgentPresences } from "@/services/agent-presence";
import { MAIN_AGENT_NAME, agentColorStyle } from "@/services/agent-identity";
import { targetLabel, useSuggestionTarget } from "@/components/ContentReview/target";
import { AgentAvatar } from "@/components/AgentIdentity/AgentAvatar";
import {
  useAgentCommentDraft,
  type AgentCommentDraft,
  type AgentCommentTarget,
} from "./agentCommentDraft";

const QUOTE_LIMIT = 500;

/** 这篇正文上出现过的 Agent（留过建议或此刻在场），供 @ 选择；不含主对话自己 */
function useKnownAgents(contentId: number) {
  const { data: suggestions } = useContentSuggestions(contentId);
  const { data: presences } = useAgentPresences(contentId);
  return [
    ...new Set([
      ...(presences ?? []).map(item => item.agent),
      ...(suggestions ?? []).map(item => item.agentLabel ?? ""),
    ]),
  ].filter(name => name && name !== MAIN_AGENT_NAME);
}

export function AgentCommentComposer({
  target,
  draft,
}: {
  target: AgentCommentTarget;
  draft: AgentCommentDraft;
}) {
  const [anchor, setAnchor] = useState<HTMLSpanElement | null>(null);
  const [agent, setAgent] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const agents = useKnownAgents(target.contentId);
  const { data: location } = useSuggestionTarget(target.contentId);
  const { data: permissions } = useAgentPermissions(target.contentId);
  const who = agent ?? MAIN_AGENT_NAME;
  const level = permissionOf(permissions, who);
  const close = () => useAgentCommentDraft.setState({ draft: null });
  const send = async () => {
    const instruction = text.trim();
    if (!instruction) return;
    const mention: MentionRef = {
      entityType: target.entityType,
      entityId: target.entityId,
      contentId: target.contentId,
      title: targetLabel(location),
      previewText: draft.quote.slice(0, QUOTE_LIMIT),
      quote: true,
    };
    setSending(true);
    const sent = await sendToChat({
      content: [
        {
          type: "text",
          text: `${serializeMentionRef(mention)}\n${agent ? `@${agent} ` : ""}${instruction}`,
          mentions: [mention],
        },
      ],
    });
    setSending(false);
    if (!sent) {
      toast.error("没能发到对话，请打开右侧对话后重试");
      return;
    }
    toast.success(agent ? `已交给${agent}` : "已发给助手");
    close();
  };
  return (
    <>
      {createPortal(
        <span
          ref={setAnchor}
          aria-hidden
          className="pointer-events-none fixed"
          style={draft.rect}
        />,
        document.body
      )}
      {anchor ? (
        <Popover
          anchor={anchor}
          open
          onOpenChange={open => !open && close()}
          placement="bottom-start"
          arrow={false}
          className="w-[420px] max-w-[calc(100vw-32px)]"
        >
          <Popover.Header icon={<AtSign className="size-[15px]" strokeWidth={1.75} />}>
            交给 Agent
          </Popover.Header>
          <Popover.Body>
            <div className="flex flex-col gap-2.5">
              <div className="text-tau-meta text-ink-3 border-line-1 line-clamp-3 border-l-2 pl-2 break-words">
                {draft.quote}
              </div>
              {agents.length ? (
                <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="交给谁">
                  {agents.map(name => (
                    <button
                      key={name}
                      type="button"
                      role="radio"
                      aria-checked={agent === name}
                      style={agentColorStyle(name)}
                      onClick={() => setAgent(current => (current === name ? null : name))}
                      className={cn(
                        "border-line-1 text-tau-meta hover:bg-hover flex h-7 cursor-pointer items-center gap-1.5 rounded-full border pr-2.5 pl-1",
                        agent === name &&
                          "border-[var(--agent)] bg-[color-mix(in_oklch,var(--agent)_10%,transparent)]"
                      )}
                    >
                      <AgentAvatar name={name} size={18} />
                      {name}
                    </button>
                  ))}
                </div>
              ) : null}
              <Textarea
                autoFocus
                value={text}
                onChange={event => setText(event.target.value)}
                placeholder={
                  agent
                    ? `让${agent}做什么？如「核对这段的年份和说法，有出处就附上」`
                    : "想让 Agent 做什么？写「@调研员 …」可以点名一个新的 Agent"
                }
                rows={3}
                className="[field-sizing:content] min-h-20 resize-y"
                onKeyDown={event => {
                  if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                    event.preventDefault();
                    void send();
                  }
                }}
              />
            </div>
          </Popover.Body>
          <Popover.Footer>
            <span className="text-tau-meta text-ink-3 mr-auto">
              {level === "readonly"
                ? `${who}在这篇只读，只会在对话里回复`
                : level === "direct"
                  ? `${who}可以直接改这篇，事后可撤销`
                  : `${who}的改动会落成建议，等你接受`}
            </span>
            <Button
              variant="primary"
              size="sm"
              icon={Send}
              disabled={!text.trim()}
              loading={sending}
              onClick={() => void send()}
            >
              发送
            </Button>
          </Popover.Footer>
        </Popover>
      ) : null}
    </>
  );
}
