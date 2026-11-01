// 工具时间线：一组相邻的工具调用按执行顺序逐条展示，不合并。
// 查询类是一行（点开底部详情面板）；写入成功是结果卡；等确认是确认卡；提问是提问卡；图片直接画出来。
// 插件注册了自己的展示时照常交给渲染注册表。

import { memo, useState, useSyncExternalStore, type ReactNode } from "react";
import { ASK_QUESTION_TOOL_NAME } from "@tau/shared/chat-core";
import type { ToolCallExecutionState } from "@tau/shared/chat-renderers";
import { toolCallRendererRegistry } from "@tau/chat-ui/renderers";
import { ToolCallBlock } from "@tau/chat-ui/conversation";
import { ApprovalCard } from "./ApprovalCard";
import { ImageResult } from "./ImageResult";
import { isWriteTool } from "./presenters";
import { QuestionCard } from "./QuestionCard";
import { ResultCard } from "./ResultCard";
import { hasResultCard, parseImagePayload } from "./results";
import { ToolDetailSheet } from "./ToolDetailSheet";
import { ToolRow } from "./ToolRow";

const IMAGE_TOOLS = new Set(["generate_image", "edit_image"]);

function rendererKeyOf(execution: ToolCallExecutionState) {
  const render = execution.metadata?.render as { rendererKey?: unknown } | undefined;
  return typeof render?.rendererKey === "string" ? render.rendererKey : "";
}

type Item =
  | { kind: "row" }
  | { kind: "card"; node: ReactNode }
  /** 行 + 行下的内容（图片） */
  | { kind: "row+"; node: ReactNode };

function classify(execution: ToolCallExecutionState, isDark: boolean): Item {
  if (execution.toolName === ASK_QUESTION_TOOL_NAME) return { kind: "card", node: null };
  if (execution.status === "awaiting-approval") return { kind: "card", node: null };
  if (isWriteTool(execution.toolName) && hasResultCard(execution))
    return { kind: "card", node: <ResultCard execution={execution} /> };
  if (IMAGE_TOOLS.has(execution.toolName)) {
    const running = execution.status === "pending" || execution.status === "executing";
    return running || parseImagePayload(execution)
      ? { kind: "row+", node: <ImageResult execution={execution} /> }
      : { kind: "row" };
  }
  const custom = toolCallRendererRegistry.resolve(execution.toolName, rendererKeyOf(execution));
  if (custom)
    return {
      kind: "card",
      node: (
        <ToolCallBlock
          execution={execution}
          isDark={isDark}
          renderDefaultItem={({ execution: item }) => <ToolRow execution={item} />}
        />
      ),
    };
  return { kind: "row" };
}

export const ToolTimeline = memo(function ToolTimeline(props: {
  executions: ToolCallExecutionState[];
  isDark: boolean;
}) {
  // 插件渲染器注册或卸载后重新分流
  useSyncExternalStore(
    toolCallRendererRegistry.subscribe,
    toolCallRendererRegistry.getSnapshot,
    toolCallRendererRegistry.getSnapshot
  );
  const [openId, setOpenId] = useState<string | null>(null);
  const opened = props.executions.find(item => item.toolCallId === openId) ?? null;
  let previousRow = false;
  return (
    <div className="flex min-w-0 flex-col">
      {props.executions.map(execution => {
        const item = classify(execution, props.isDark);
        const linked = previousRow;
        previousRow = item.kind === "row";
        const open = () => setOpenId(execution.toolCallId);
        let node: ReactNode;
        if (execution.toolName === ASK_QUESTION_TOOL_NAME)
          node = <QuestionCard execution={execution} linked={linked} />;
        else if (execution.status === "awaiting-approval")
          node = <ApprovalCard execution={execution} linked={linked} />;
        else if (item.kind === "card") node = item.node;
        else
          node = (
            <>
              <ToolRow execution={execution} linked={linked} onOpen={open} />
              {item.kind === "row+" && item.node}
            </>
          );
        return (
          <div key={execution.toolCallId} className="min-w-0">
            {node}
          </div>
        );
      })}
      <ToolDetailSheet execution={opened} onClose={() => setOpenId(null)} />
    </div>
  );
});
