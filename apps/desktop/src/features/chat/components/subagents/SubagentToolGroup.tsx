import type { ReactNode } from "react";
import type { ToolCallExecutionState } from "@tau/shared/chat-renderers";
import { SubagentTaskCard } from "./SubagentTaskCard";
import { useSubagentItems, type SubagentItem } from "./useSubagentItems";
import { useSubagentParent } from "./parentContext";
import { DISPATCH_KIND, dispatchedAgentId, parseJson, type DispatchKind } from "./dispatch";

type Segment =
  | { type: "tool"; execution: ToolCallExecutionState }
  | {
      type: "card";
      kind: DispatchKind;
      items: SubagentItem[];
      sync: boolean;
      key: string;
    };

/**
 * 工具组渲染：同一组里连续的 spawn_agent / send_agent 合成一张任务卡，
 * 尚未拿到身份或调用失败的仍走普通工具行。
 */
export function SubagentToolGroup({
  executions,
  isDark,
  renderTool,
}: {
  executions: ToolCallExecutionState[];
  isDark: boolean;
  renderTool: (execution: ToolCallExecutionState) => ReactNode;
}) {
  const { items } = useSubagentItems(useSubagentParent());
  const byId = new Map(items.map(item => [item.view.agent.agentId, item]));
  const segments: Segment[] = [];
  for (const execution of executions) {
    const kind = DISPATCH_KIND[execution.toolName];
    const agentId =
      kind && execution.status !== "failed" ? dispatchedAgentId(execution) : undefined;
    const item = agentId ? byId.get(agentId) : undefined;
    if (!kind || !item) {
      segments.push({ type: "tool", execution });
      continue;
    }
    const sync = parseJson(execution.input)?.mode === "sync";
    const last = segments.at(-1);
    if (
      last?.type === "card" &&
      last.kind === kind &&
      last.sync === sync &&
      last.items[0].view.parentScope === item.view.parentScope &&
      !last.items.includes(item)
    ) {
      last.items.push(item);
    } else {
      segments.push({
        type: "card",
        kind,
        items: [item],
        sync,
        key: execution.toolCallId,
      });
    }
  }
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      {segments.map(segment =>
        segment.type === "tool" ? (
          <div key={segment.execution.toolCallId} className="min-w-0">
            {renderTool(segment.execution)}
          </div>
        ) : (
          <SubagentTaskCard
            key={segment.key}
            parentScope={segment.items[0].view.parentScope}
            items={segment.items}
            kind={segment.kind}
            sync={segment.sync}
            isDark={isDark}
          />
        )
      )}
    </div>
  );
}
