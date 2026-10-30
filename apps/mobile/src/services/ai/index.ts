export { MobileAiService, createMobileAiService } from "./service";
export type { MobileAiOptions, MobileAiSessionSnapshot } from "./service";
export { bindMobileAiLifecycle } from "./lifecycle";
export type {
  AiRunStartRequest,
  AiSessionRef,
  AiModelRef,
  AiToolSpec,
  AiToolExecutor,
  AiToolExecutionContext,
  AiToolResult,
} from "@tau/ai/contracts";
export { AiError } from "@tau/ai/contracts";
export type {
  AiRunHandle,
  AiRunSnapshot,
  AiRuntimeNotification,
  AiGenerationRequest,
  AiRetryRunRequest,
  AiGenerationHandle,
  AiGenerationResult,
  AiApproval,
  AiQuestion,
} from "@tau/ai/runtime";
export type { SessionEdit } from "@tau/ai/session";

import { createMobileAiService } from "./service";
import { bindMobileAiLifecycle } from "./lifecycle";
let instance: ReturnType<typeof createMobileAiService> | undefined;

/** 审批与提问由页面经运行快照里的等待项作答（interactions.*）；回调只挂起到作答或运行结束 */
const waitForHost = () => new Promise<never>(() => undefined);

/** 只有明确消费者调用时才创建服务，不引入页面或自动运行入口。 */
export const getMobileAiService = () => {
  if (!instance) {
    instance = createMobileAiService({
      // 写入与执行每次都确认；只读工具不问
      permissionMode: () => "manual",
      approve: waitForHost,
      question: waitForHost,
      // 只有对话页（宿主交互）带系统提示；插件调用不受影响
      preparePrompt: async request =>
        request.interactionMode === "host"
          ? (await import("../aiChat/hostTools")).buildChatSystemPrompt()
          : undefined,
    });
    bindMobileAiLifecycle(instance);
  }
  return instance;
};
