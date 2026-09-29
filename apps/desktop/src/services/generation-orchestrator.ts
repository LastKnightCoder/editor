import { Role } from "@/constants";
import type { LLMProviderSetting, LLMModelSetting } from "@/types/pi-llm";
import type { RequestMessage, ToolCallExecutionState, ToolCallPayload } from "@/types/llm";
import type { ToolExecutionResult } from "@/types";
import type { ModelUsage as AgentModelUsage } from "@tau/shared";
import type { PPTTemplate } from "@/constants/ppt-templates";
import type { ReportTemplate } from "@/constants/report-templates";
import type { PodcastSpeaker } from "@/types/podcast";
import { runPiAgent } from "@/services/piAgentRunner";
import { PiChatEventReducer } from "@/services/piChatEvents";
import { piStreamChat, piTextOf, piThinkingOf } from "@/services/piLLM";
import toolRegistry, { ensureToolingReady } from "@/tools";
import {
  OUTLINE_GENERATION_WITH_TOOLS_PROMPT,
  OUTLINE_GENERATION_WITH_TOOLS_USER_PROMPT,
  OUTLINE_GENERATION_SIMPLE_PROMPT,
} from "@/constants/prompts/outline-generation";
import {
  MINDMAP_GENERATION_WITH_TOOLS_PROMPT,
  MINDMAP_GENERATION_WITH_TOOLS_USER_PROMPT,
} from "@/constants/prompts/mindmap-generation";
import {
  HIGHLIGHTS_GENERATION_WITH_TOOLS_PROMPT,
  HIGHLIGHTS_GENERATION_WITH_TOOLS_USER_PROMPT,
} from "@/constants/prompts/highlights-generation";
import {
  ARTICLE_GENERATION_WITH_TOOLS_PROMPT,
  ARTICLE_GENERATION_WITH_TOOLS_USER_PROMPT,
} from "@/constants/prompts/article-generation";
import {
  QUIZ_GENERATION_PROMPT,
  QUIZ_GENERATION_USER_PROMPT,
  QUIZ_GENERATION_WITH_TOOLS_PROMPT,
  QUIZ_GENERATION_WITH_TOOLS_USER_PROMPT,
} from "@/constants/prompts/quiz-generation";
import {
  getPPTGenerationPrompt,
  getPPTGenerationUserPrompt,
} from "@/constants/prompts/ppt-generation";
import { buildPPTEditUserPrompt, getPPTEditPrompt } from "@/constants/prompts/ppt-edit";
import {
  getReportGenerationPrompt,
  getReportGenerationUserPrompt,
} from "@/constants/prompts/report-generation";
import { getReportEditPrompt, buildReportEditUserPrompt } from "@/constants/prompts/report-edit";
import { PROVIDED_CONTENT_GENERATION_RULES } from "@/constants/prompts/provided-content-generation";
import {
  buildPodcastProvidedContentSystemPrompt,
  buildPodcastProvidedContentUserPrompt,
  buildPodcastToolsSystemPrompt,
  buildPodcastToolsUserPrompt,
  type PodcastTTSPromptOptions,
} from "@/services/podcast";
import type { VideoEbookRewriteStyle } from "@/constants/prompts/video-ebook-rewrite";

type EmptyTaskPayload = Record<string, never>;

export type GenerationTaskType =
  | "outline"
  | "mindmap"
  | "highlights"
  | "article"
  | "quiz"
  | "ppt"
  | "ppt_edit"
  | "podcast"
  | "report"
  | "report_edit";

export type GenerationSourceType = "vibe_learning" | "provided_content";

export interface VibeLearningSourcePayload {
  projectId?: number;
  mainDbName?: string;
  resourceNames: string[];
  userPrompt?: string;
}

export interface ProvidedContentSourcePayload {
  content: string;
  userPrompt?: string;
}

export interface GenerationTaskPayloadMap {
  outline: EmptyTaskPayload;
  mindmap: EmptyTaskPayload;
  highlights: EmptyTaskPayload;
  article: { style: VideoEbookRewriteStyle };
  quiz: EmptyTaskPayload;
  ppt: { template: PPTTemplate };
  ppt_edit: { currentHtml: string };
  podcast: {
    speakers: PodcastSpeaker[];
    ttsPromptOptions: PodcastTTSPromptOptions;
    durationMin?: number;
    durationMax?: number;
  };
  report: { template: ReportTemplate };
  report_edit: { currentHtml: string };
}

export interface GenerationSourcePayloadMap {
  vibe_learning: VibeLearningSourcePayload;
  provided_content: ProvidedContentSourcePayload;
}

export interface GenerationRequest<
  TTask extends GenerationTaskType = GenerationTaskType,
  TSource extends GenerationSourceType = GenerationSourceType,
> {
  taskType: TTask;
  sourceType: TSource;
  taskPayload: GenerationTaskPayloadMap[TTask];
  sourcePayload: GenerationSourcePayloadMap[TSource];
}

export interface GenerationBuildResult {
  messages: RequestMessage[];
  enableTools: boolean;
}

export interface GenerationRunCallbacks {
  onUpdate: (responseText: string, turnId?: string) => void;
  onFinish: (fullContent: string) => void;
  onError: (error: Error) => void;
  onController?: (controller: AbortController) => void;
  onToolCallsUpdate?: (executions: ToolCallExecutionState[], turnId?: string) => void;
  /** 推理过程（逐轮累计文本） */
  onReasoning?: (reasoningText: string, turnId?: string) => void;
  /** 每轮结束时的 token 用量 */
  onUsage?: (usage: AgentModelUsage, turnId?: string) => void;
}

/** 按次注入的工具（覆盖全局注册表里的同名工具）：后台任务用它绑定自己的项目 */
export interface GenerationRunOptions {
  databaseName?: string;
  additionalTools?: Array<{
    type: "function";
    function: {
      name: string;
      description: string;
      parameters: Record<string, unknown>;
    };
  }>;
  /** 自定义工具执行器（用于路由到外部执行，如浏览器扩展）；返回 null 表示未接管 */
  executeToolCall?: (
    call: ToolCallPayload,
    options?: {
      signal?: AbortSignal;
      conversationKey?: string;
      toolContext?: Record<string, unknown>;
    }
  ) => Promise<ToolExecutionResult | null>;
}

const createTextMessage = (role: Role, text: string): RequestMessage => ({
  role,
  content: [{ type: "text", text }],
});

const isToolEnabled = (toolName: string) => {
  ensureToolingReady();
  return toolRegistry.hasEnabledTool(toolName);
};

export function buildGenerationRequest(request: GenerationRequest): GenerationBuildResult {
  if (request.sourceType === "vibe_learning") {
    const sourcePayload = request.sourcePayload as VibeLearningSourcePayload;
    return buildVibeLearningGenerationRequest(request.taskType, request.taskPayload, sourcePayload);
  }

  const sourcePayload = request.sourcePayload as ProvidedContentSourcePayload;
  return buildProvidedContentGenerationRequest(
    request.taskType,
    request.taskPayload,
    sourcePayload
  );
}

export function runGenerationTask(
  provider: LLMProviderSetting,
  model: LLMModelSetting,
  request: GenerationRequest,
  callbacks: GenerationRunCallbacks,
  options: GenerationRunOptions = {}
): void {
  const buildResult = buildGenerationRequest(request);
  // 用量归属：播客走独立功能槽，其余生成任务按任务类型区分
  const source = {
    feature:
      request.taskType === "podcast" ? "podcastGeneration" : `generation:${request.taskType}`,
  };

  // 单发路径（provided_content）：直接消费 pi 原生事件（partial 全量快照）
  if (!buildResult.enableTools) {
    const handle = piStreamChat(
      { provider, model, messages: buildResult.messages, source },
      event => {
        if (event.type === "text_delta" || event.type === "text_end") {
          callbacks.onUpdate(piTextOf(event.partial));
        } else if (event.type === "thinking_delta" || event.type === "thinking_end") {
          callbacks.onReasoning?.(piThinkingOf(event.partial));
        }
      }
    );
    callbacks.onController?.(toAbortController(handle));
    void handle.result.then(result => {
      if (result.ok && !result.aborted) {
        callbacks.onFinish(result.text);
        return;
      }
      if (!result.aborted) callbacks.onError(new Error(result.error ?? "模型请求失败"));
    });
    return;
  }

  // 带工具路径（vibe_learning）：一次性 pi 会话（工具桥直连渲染端 ToolRegistry）
  let streamError: string | null = null;
  const reducer = new PiChatEventReducer({
    applyText: (turnId, text) => callbacks.onUpdate(text, turnId),
    applyReasoning: (turnId, text) => callbacks.onReasoning?.(text, turnId),
    applyToolCalls: (turnId, executions) => callbacks.onToolCallsUpdate?.(executions, turnId),
    finalizeTurn: () => {},
    applyUsage: (usage, turnId) => callbacks.onUsage?.(usage, turnId),
    onAssistantTurnEnd: () => {},
    onRetryStatus: () => {},
    onStreamError: errorMessage => {
      streamError = errorMessage;
    },
    onSettled: () => {},
  });
  const handle = runPiAgent(
    {
      databaseName: options.databaseName,
      provider,
      model,
      messages: buildResult.messages,
      source,
      additionalTools: options.additionalTools,
      ...(options.executeToolCall
        ? {
            executeAdditionalTool: async ({ toolName, args, signal }) => {
              const outcome = await options.executeToolCall!(
                {
                  id: "",
                  function: {
                    name: toolName,
                    arguments: args === undefined ? "" : JSON.stringify(args),
                  },
                },
                { signal }
              );
              if (!outcome) return null;
              return {
                content: outcome.content ?? "",
                ...(typeof outcome.modelContent === "string"
                  ? { modelContent: outcome.modelContent }
                  : {}),
                ...(outcome.metadata
                  ? { metadata: outcome.metadata as Record<string, unknown> }
                  : {}),
              };
            },
          }
        : {}),
    },
    event => reducer.handle(event)
  );
  callbacks.onController?.(toAbortController(handle));
  void handle.result.then(result => {
    if (result.ok && !result.aborted && !streamError) {
      callbacks.onFinish(result.lastAssistantText);
      return;
    }
    if (!result.aborted) {
      callbacks.onError(new Error(streamError ?? result.error ?? "模型请求失败"));
    }
  });
}

/** 旧回调契约的 AbortController 适配（消费方仍有 controller 语义时过渡） */
function toAbortController(handle: { cancel?(): void; abort?(): void }): AbortController {
  const controller = new AbortController();
  controller.signal.addEventListener("abort", () => {
    if (handle.cancel) handle.cancel();
    else handle.abort?.();
  });
  return controller;
}

function buildVibeLearningGenerationRequest(
  taskType: GenerationTaskType,
  taskPayload: GenerationTaskPayloadMap[GenerationTaskType],
  sourcePayload: VibeLearningSourcePayload
): GenerationBuildResult {
  switch (taskType) {
    case "outline":
      return {
        messages: [
          createTextMessage(Role.System, OUTLINE_GENERATION_WITH_TOOLS_PROMPT),
          createTextMessage(
            Role.User,
            OUTLINE_GENERATION_WITH_TOOLS_USER_PROMPT(
              sourcePayload.resourceNames,
              sourcePayload.userPrompt
            )
          ),
        ],
        enableTools: true,
      };
    case "mindmap":
      return {
        messages: [
          createTextMessage(Role.System, MINDMAP_GENERATION_WITH_TOOLS_PROMPT),
          createTextMessage(
            Role.User,
            MINDMAP_GENERATION_WITH_TOOLS_USER_PROMPT(
              sourcePayload.resourceNames,
              sourcePayload.userPrompt
            )
          ),
        ],
        enableTools: true,
      };
    case "highlights":
      return {
        messages: [
          createTextMessage(Role.System, HIGHLIGHTS_GENERATION_WITH_TOOLS_PROMPT),
          createTextMessage(
            Role.User,
            HIGHLIGHTS_GENERATION_WITH_TOOLS_USER_PROMPT(
              sourcePayload.resourceNames,
              sourcePayload.userPrompt
            )
          ),
        ],
        enableTools: true,
      };
    case "article": {
      const payload = taskPayload as GenerationTaskPayloadMap["article"];
      return {
        messages: [
          createTextMessage(Role.System, ARTICLE_GENERATION_WITH_TOOLS_PROMPT),
          createTextMessage(
            Role.User,
            ARTICLE_GENERATION_WITH_TOOLS_USER_PROMPT(
              sourcePayload.resourceNames,
              payload.style,
              sourcePayload.userPrompt
            )
          ),
        ],
        enableTools: true,
      };
    }
    case "quiz":
      return {
        messages: [
          createTextMessage(Role.System, QUIZ_GENERATION_WITH_TOOLS_PROMPT),
          createTextMessage(
            Role.User,
            QUIZ_GENERATION_WITH_TOOLS_USER_PROMPT(
              sourcePayload.resourceNames,
              sourcePayload.userPrompt
            )
          ),
        ],
        enableTools: true,
      };
    case "ppt": {
      const payload = taskPayload as GenerationTaskPayloadMap["ppt"];
      return {
        messages: [
          createTextMessage(
            Role.System,
            getPPTGenerationPrompt(payload.template, {
              enableAIIllustration: isToolEnabled("generate_image"),
            })
          ),
          createTextMessage(
            Role.User,
            getPPTGenerationUserPrompt(
              sourcePayload.resourceNames,
              payload.template.name,
              sourcePayload.userPrompt
            )
          ),
        ],
        enableTools: true,
      };
    }
    case "ppt_edit": {
      const payload = taskPayload as GenerationTaskPayloadMap["ppt_edit"];
      return {
        messages: [
          createTextMessage(Role.System, getPPTEditPrompt(payload.currentHtml)),
          createTextMessage(
            Role.User,
            buildPPTEditUserPrompt(sourcePayload.userPrompt || "", sourcePayload.resourceNames)
          ),
        ],
        enableTools: true,
      };
    }
    case "report": {
      const payload = taskPayload as GenerationTaskPayloadMap["report"];
      return {
        messages: [
          createTextMessage(Role.System, getReportGenerationPrompt(payload.template)),
          createTextMessage(
            Role.User,
            getReportGenerationUserPrompt(
              sourcePayload.resourceNames,
              payload.template.name,
              sourcePayload.userPrompt
            )
          ),
        ],
        enableTools: true,
      };
    }
    case "report_edit": {
      const payload = taskPayload as GenerationTaskPayloadMap["report_edit"];
      return {
        messages: [
          createTextMessage(Role.System, getReportEditPrompt(payload.currentHtml)),
          createTextMessage(
            Role.User,
            buildReportEditUserPrompt(sourcePayload.userPrompt || "", sourcePayload.resourceNames)
          ),
        ],
        enableTools: true,
      };
    }
    case "podcast": {
      const payload = taskPayload as GenerationTaskPayloadMap["podcast"];
      return {
        messages: [
          createTextMessage(
            Role.System,
            buildPodcastToolsSystemPrompt(
              payload.speakers,
              payload.ttsPromptOptions,
              payload.durationMin,
              payload.durationMax
            )
          ),
          createTextMessage(
            Role.User,
            buildPodcastToolsUserPrompt(
              sourcePayload.resourceNames,
              sourcePayload.userPrompt,
              payload.durationMin,
              payload.durationMax
            )
          ),
        ],
        enableTools: true,
      };
    }
    default:
      throw new Error(`不支持的生成任务: ${taskType}`);
  }
}

function buildProvidedContentGenerationRequest(
  taskType: GenerationTaskType,
  taskPayload: GenerationTaskPayloadMap[GenerationTaskType],
  sourcePayload: ProvidedContentSourcePayload
): GenerationBuildResult {
  switch (taskType) {
    case "outline":
      return {
        messages: [
          createTextMessage(
            Role.System,
            `${PROVIDED_CONTENT_GENERATION_RULES}\n\n${OUTLINE_GENERATION_SIMPLE_PROMPT}`
          ),
          createTextMessage(
            Role.User,
            `以下是学习资料内容，请基于这些已提供内容生成学习大纲：\n\n---\n${sourcePayload.content}\n---${
              sourcePayload.userPrompt?.trim()
                ? `\n\n额外要求：${sourcePayload.userPrompt.trim()}`
                : ""
            }`
          ),
        ],
        enableTools: false,
      };
    case "quiz":
      return {
        messages: [
          createTextMessage(
            Role.System,
            `${PROVIDED_CONTENT_GENERATION_RULES}\n\n${QUIZ_GENERATION_PROMPT}`
          ),
          createTextMessage(
            Role.User,
            QUIZ_GENERATION_USER_PROMPT(sourcePayload.content, sourcePayload.userPrompt)
          ),
        ],
        enableTools: false,
      };
    case "podcast": {
      const payload = taskPayload as GenerationTaskPayloadMap["podcast"];
      return {
        messages: [
          createTextMessage(
            Role.System,
            buildPodcastProvidedContentSystemPrompt(
              payload.speakers,
              payload.ttsPromptOptions,
              payload.durationMin,
              payload.durationMax
            )
          ),
          createTextMessage(
            Role.User,
            buildPodcastProvidedContentUserPrompt(
              sourcePayload.content,
              sourcePayload.userPrompt,
              payload.durationMin,
              payload.durationMax
            )
          ),
        ],
        enableTools: false,
      };
    }
    case "mindmap":
    case "highlights":
    case "article":
    case "ppt":
    case "ppt_edit":
    case "report":
    case "report_edit":
      throw new Error(`任务 ${taskType} 当前未接入 provided_content 数据源，请改用对应专用入口`);
    default:
      throw new Error(`不支持的生成任务: ${taskType}`);
  }
}
