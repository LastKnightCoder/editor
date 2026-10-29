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

/** 只有明确消费者调用时才创建服务，不引入页面或自动运行入口。 */
export const getMobileAiService = () => {
  if (!instance) {
    instance = createMobileAiService();
    bindMobileAiLifecycle(instance);
  }
  return instance;
};
