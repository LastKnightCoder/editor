import { ASK_QUESTION_TOOL_NAME } from "@tau/shared/chat-core";
import { registerToolCallRenderer } from "../renderers/registry";
import AskQuestionRenderer from "./AskQuestionRenderer";

export * from "./host";
export { ToolApprovalBar, summarizeToolInput } from "./ToolApprovalBar";
export { AskQuestionRenderer };

/** 登记交互类工具的渲染器（目前是 ask-question 提问卡）；重复调用无副作用 */
let registered = false;
export function registerInteractionRenderers(): void {
  if (registered) return;
  registered = true;
  registerToolCallRenderer(ASK_QUESTION_TOOL_NAME, AskQuestionRenderer);
}
