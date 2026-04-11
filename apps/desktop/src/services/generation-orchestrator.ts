import { Role } from "@/constants";
import type {
  ProviderConfig,
  ModelConfig,
  RequestMessage,
  ToolCallExecutionState,
} from "@/types/llm";
import type { PPTTemplate } from "@/constants/ppt-templates";
import type { PodcastSpeaker } from "@/types/podcast";
import { chatLLMStream } from "@/hooks/useChatLLM";
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
import {
  buildPPTEditUserPrompt,
  getPPTEditPrompt,
} from "@/constants/prompts/ppt-edit";
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
  | "podcast";

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
  onUpdate: (responseText: string) => void;
  onFinish: (fullContent: string) => void;
  onError: (error: Error) => void;
  onController?: (controller: AbortController) => void;
  onToolCallsUpdate?: (executions: ToolCallExecutionState[]) => void;
}

const createTextMessage = (role: Role, text: string): RequestMessage => ({
  role,
  content: [{ type: "text", text }],
});

export function buildGenerationRequest(
  request: GenerationRequest,
): GenerationBuildResult {
  if (request.sourceType === "vibe_learning") {
    const sourcePayload = request.sourcePayload as VibeLearningSourcePayload;
    return buildVibeLearningGenerationRequest(
      request.taskType,
      request.taskPayload,
      sourcePayload,
    );
  }

  const sourcePayload = request.sourcePayload as ProvidedContentSourcePayload;
  return buildProvidedContentGenerationRequest(
    request.taskType,
    request.taskPayload,
    sourcePayload,
  );
}

export function runGenerationTask(
  providerConfig: ProviderConfig,
  modelConfig: ModelConfig,
  request: GenerationRequest,
  callbacks: GenerationRunCallbacks,
): void {
  const buildResult = buildGenerationRequest(request);

  chatLLMStream(providerConfig, modelConfig, buildResult.messages, {
    enableTools: buildResult.enableTools,
    onUpdate: callbacks.onUpdate,
    onFinish: callbacks.onFinish,
    onError: callbacks.onError,
    onController: callbacks.onController,
    onToolCallsUpdate: callbacks.onToolCallsUpdate,
  });
}

function buildVibeLearningGenerationRequest(
  taskType: GenerationTaskType,
  taskPayload: GenerationTaskPayloadMap[GenerationTaskType],
  sourcePayload: VibeLearningSourcePayload,
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
              sourcePayload.userPrompt,
            ),
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
              sourcePayload.userPrompt,
            ),
          ),
        ],
        enableTools: true,
      };
    case "highlights":
      return {
        messages: [
          createTextMessage(
            Role.System,
            HIGHLIGHTS_GENERATION_WITH_TOOLS_PROMPT,
          ),
          createTextMessage(
            Role.User,
            HIGHLIGHTS_GENERATION_WITH_TOOLS_USER_PROMPT(
              sourcePayload.resourceNames,
              sourcePayload.userPrompt,
            ),
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
              sourcePayload.userPrompt,
            ),
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
              sourcePayload.userPrompt,
            ),
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
            getPPTGenerationPrompt(payload.template),
          ),
          createTextMessage(
            Role.User,
            getPPTGenerationUserPrompt(
              sourcePayload.resourceNames,
              payload.template.name,
              sourcePayload.userPrompt,
            ),
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
            buildPPTEditUserPrompt(
              sourcePayload.userPrompt || "",
              sourcePayload.resourceNames,
            ),
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
              payload.durationMax,
            ),
          ),
          createTextMessage(
            Role.User,
            buildPodcastToolsUserPrompt(
              sourcePayload.resourceNames,
              sourcePayload.userPrompt,
              payload.durationMin,
              payload.durationMax,
            ),
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
  sourcePayload: ProvidedContentSourcePayload,
): GenerationBuildResult {
  switch (taskType) {
    case "outline":
      return {
        messages: [
          createTextMessage(
            Role.System,
            `${PROVIDED_CONTENT_GENERATION_RULES}\n\n${OUTLINE_GENERATION_SIMPLE_PROMPT}`,
          ),
          createTextMessage(
            Role.User,
            `以下是学习资料内容，请基于这些已提供内容生成学习大纲：\n\n---\n${sourcePayload.content}\n---${
              sourcePayload.userPrompt?.trim()
                ? `\n\n额外要求：${sourcePayload.userPrompt.trim()}`
                : ""
            }`,
          ),
        ],
        enableTools: false,
      };
    case "quiz":
      return {
        messages: [
          createTextMessage(
            Role.System,
            `${PROVIDED_CONTENT_GENERATION_RULES}\n\n${QUIZ_GENERATION_PROMPT}`,
          ),
          createTextMessage(
            Role.User,
            QUIZ_GENERATION_USER_PROMPT(
              sourcePayload.content,
              sourcePayload.userPrompt,
            ),
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
              payload.durationMax,
            ),
          ),
          createTextMessage(
            Role.User,
            buildPodcastProvidedContentUserPrompt(
              sourcePayload.content,
              sourcePayload.userPrompt,
              payload.durationMin,
              payload.durationMax,
            ),
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
      throw new Error(
        `任务 ${taskType} 当前未接入 provided_content 数据源，请改用对应专用入口`,
      );
    default:
      throw new Error(`不支持的生成任务: ${taskType}`);
  }
}
