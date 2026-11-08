import type { AgentSessionEvent } from "@earendil-works/pi-coding-agent";
import type { SubagentOutcome } from "@/types/subagent";

export const errorMessage = (error: unknown): string => {
  const message =
    typeof error === "string"
      ? error
      : error &&
          typeof error === "object" &&
          "message" in error &&
          typeof error.message === "string"
        ? error.message
        : "";
  return message.trim() || "本次执行失败，底层未提供错误详情";
};

/** 只接受真实最终消息；settled 只是结束信号，不能推断成功。 */
export class SubagentResultCollector {
  private outcome: SubagentOutcome | undefined;

  accept(event: AgentSessionEvent): void {
    if (event.type === "message_end" && event.message.role === "assistant") {
      const message = event.message;
      if (message.stopReason === "error") {
        this.outcome = {
          status: "failed",
          error: { message: errorMessage(message.errorMessage) },
        };
      } else if (message.stopReason === "aborted") {
        this.outcome = {
          status: "interrupted",
          error: { message: message.errorMessage || "模型执行已中断" },
        };
      } else if (message.stopReason !== "toolUse") {
        this.outcome = {
          status: "completed",
          result: message.content
            .filter(block => block.type === "text")
            .map(block => block.text)
            .join("\n\n"),
        };
      }
    }
    if (event.type === "auto_retry_end" && !event.success && event.finalError) {
      this.outcome = { status: "failed", error: { message: event.finalError } };
    }
  }

  result(): SubagentOutcome {
    return (
      this.outcome ?? {
        status: "interrupted",
        error: { message: "执行已结束，但未收到最终结果" },
      }
    );
  }
}
