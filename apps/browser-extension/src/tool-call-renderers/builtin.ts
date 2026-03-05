import { registerToolCallRenderers } from "@tau/shared";
import AskQuestionRenderer from "./AskQuestionRenderer";
import { ASK_QUESTION_TOOL_NAME } from "@/tools/askQuestionTypes";

export function initToolCallRenderers(): void {
  registerToolCallRenderers([
    {
      toolName: ASK_QUESTION_TOOL_NAME,
      renderer: AskQuestionRenderer,
    },
  ]);
}
