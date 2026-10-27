import { Role } from "@/constants";
import { buildWebClipConvertPrompt } from "@/constants/prompts/web-clip";
import { createContent, replaceContent } from "@/commands/content";
import { findClippedWebClipId, recordWebClip } from "@/commands/lineage";
import { createWebClip, getWebClipById, updateWebClip } from "@/commands/web-clip";
import { piStreamChat, piTextOf, type PiChatHandle } from "@/services/piLLM";
import useSettingStore from "@/stores/useSettingStore";
import type { RequestMessage } from "@/types/llm";
import type { LLMProviderSetting, LLMModelSetting } from "@/types/pi-llm";
import { getContentLength } from "@/utils/helper";
import { importFromMarkdown } from "@/utils/markdown";
import { normalizeThinkTaggedText } from "@/utils/thinkTagNormalizer";
import type { Descendant } from "slate";

export interface WebClipStartParams {
  projectItemId: number;
  html: string;
  url: string;
  title: string;
  translateToChinese?: boolean;
}

export interface WebClipProgressData {
  projectItemId: number;
  markdown: string;
  delta: string;
}

export interface WebClipCompleteData {
  projectItemId: number;
  markdown: string;
  url: string;
  title: string;
  webClipId?: number;
  contentId?: number;
}

export interface WebClipErrorData {
  projectItemId: number;
  error: string;
}

export interface WebClipStatusResult {
  projectItemId: number;
  status: "processing" | "completed" | "error" | "cancelled";
  markdown: string;
}

export interface SavedWebClipResult {
  webClipId: number;
  contentId: number;
}

export interface WebClipTaskRunnerDeps {
  getLLMConfig: () => {
    provider: LLMProviderSetting;
    model: LLMModelSetting;
  };
  chatStream: typeof piStreamChat;
  saveWebClip: (params: {
    projectItemId: number;
    markdown: string;
    url: string;
    title: string;
  }) => Promise<SavedWebClipResult | null>;
}

type Handler<T> = (data: T) => void;

interface WebClipTask {
  projectItemId: number;
  url: string;
  title: string;
  chatHandle: PiChatHandle | null;
  status: WebClipStatusResult["status"];
  markdown: string;
}

const parseMarkdownToContent = (markdown: string): Descendant[] => {
  try {
    const content = importFromMarkdown(markdown, ["yaml"]);
    if (content?.length) {
      return content;
    }
  } catch (error) {
    console.warn("[WebClipTaskRunner] Parse markdown error:", error);
  }

  return [
    {
      type: "paragraph",
      children: [{ type: "formatted", text: markdown || "" }],
    },
  ];
};

const getDefaultLLMConfig = () => {
  const { llmProviders: llmConfigs, llmUsageSettings } = useSettingStore.getState().setting;
  const usageConfig = llmUsageSettings.webClip;

  if (!usageConfig) {
    throw new Error("webClip 功能未配置 LLM");
  }

  const provider = llmConfigs.find(config => config.id === usageConfig.providerId);
  if (!provider) {
    throw new Error("找不到 webClip 功能的 provider 配置");
  }

  const model = provider.models?.find(model => model.id === usageConfig.modelId);
  if (!model) {
    throw new Error("找不到 webClip 功能的 model 配置");
  }

  return { provider, model };
};

const saveWebClipToDatabase = async (params: {
  projectItemId: number;
  markdown: string;
  url: string;
  title: string;
}): Promise<SavedWebClipResult | null> => {
  const content = parseMarkdownToContent(params.markdown);
  const existingWebClipId = await findClippedWebClipId(params.projectItemId);

  if (existingWebClipId) {
    const existingWebClip = await getWebClipById(existingWebClipId);
    if (existingWebClip) {
      await replaceContent(existingWebClip.contentId, { nodes: content });
      const updatedWebClip = await updateWebClip({
        id: existingWebClip.id,
        url: params.url || existingWebClip.url,
        title: params.title || existingWebClip.title,
      });
      return {
        webClipId: updatedWebClip.id,
        contentId: existingWebClip.contentId,
      };
    }
  }

  const contentId = await createContent(content, getContentLength(content));
  if (!contentId) {
    throw new Error("创建内容失败");
  }

  const createdWebClip = await createWebClip({
    contentId,
    url: params.url,
    title: params.title || "解析文档",
  });
  await recordWebClip(params.projectItemId, createdWebClip.id);

  return {
    webClipId: createdWebClip.id,
    contentId,
  };
};

export class WebClipTaskRunner {
  private readonly activeTasks = new Map<number, WebClipTask>();
  private readonly progressHandlers = new Set<Handler<WebClipProgressData>>();
  private readonly completeHandlers = new Set<Handler<WebClipCompleteData>>();
  private readonly errorHandlers = new Set<Handler<WebClipErrorData>>();
  private readonly deps: WebClipTaskRunnerDeps;

  constructor(deps: WebClipTaskRunnerDeps) {
    this.deps = deps;
  }

  onProgress(handler: Handler<WebClipProgressData>) {
    this.progressHandlers.add(handler);
    return () => {
      this.progressHandlers.delete(handler);
    };
  }

  onComplete(handler: Handler<WebClipCompleteData>) {
    this.completeHandlers.add(handler);
    return () => {
      this.completeHandlers.delete(handler);
    };
  }

  onError(handler: Handler<WebClipErrorData>) {
    this.errorHandlers.add(handler);
    return () => {
      this.errorHandlers.delete(handler);
    };
  }

  async start(params: WebClipStartParams) {
    const existingTask = this.activeTasks.get(params.projectItemId);
    if (existingTask?.status === "processing") {
      existingTask.chatHandle?.cancel();
      existingTask.status = "cancelled";
    }

    const task: WebClipTask = {
      projectItemId: params.projectItemId,
      url: params.url,
      title: params.title,
      chatHandle: null,
      status: "processing",
      markdown: "",
    };
    this.activeTasks.set(params.projectItemId, task);

    void this.runTask(params, task);
    return { ok: true, projectItemId: params.projectItemId };
  }

  async cancel(projectItemId: number) {
    const task = this.activeTasks.get(projectItemId);
    if (task?.status === "processing") {
      task.chatHandle?.cancel();
      task.status = "cancelled";
    }
    return { ok: true };
  }

  async getStatus(projectItemId: number): Promise<WebClipStatusResult | null> {
    const task = this.activeTasks.get(projectItemId);
    if (!task) {
      return null;
    }

    return {
      projectItemId: task.projectItemId,
      status: task.status,
      markdown: task.markdown,
    };
  }

  private async runTask(params: WebClipStartParams, task: WebClipTask) {
    try {
      const { provider, model } = this.deps.getLLMConfig();
      const messages: RequestMessage[] = [
        {
          role: Role.System,
          content: [
            {
              type: "text",
              text: buildWebClipConvertPrompt(params.url, Boolean(params.translateToChinese)),
            },
          ],
        },
        {
          role: Role.User,
          content: [{ type: "text", text: params.html }],
        },
      ];

      const chatHandle = this.deps.chatStream({ provider, model, messages }, event => {
        if (task.status !== "processing") {
          return;
        }
        if (event.type !== "text_delta" && event.type !== "text_end") {
          return;
        }
        const markdown = normalizeThinkTaggedText(piTextOf(event.partial)).content;
        const delta =
          event.type === "text_delta" ? normalizeThinkTaggedText(event.delta).content : "";
        task.markdown = markdown;
        this.emitProgress({
          projectItemId: task.projectItemId,
          markdown,
          delta,
        });
      });
      task.chatHandle = chatHandle;
      const result = await chatHandle.result;

      if (task.status !== "processing") {
        return;
      }
      if (!result.ok) {
        task.status = "error";
        this.emitError({
          projectItemId: task.projectItemId,
          error: result.error ?? "模型请求失败",
        });
        return;
      }
      if (result.aborted) {
        return;
      }

      const markdown = normalizeThinkTaggedText(result.text).content;
      task.markdown = markdown;
      const savedData = await this.deps.saveWebClip({
        projectItemId: task.projectItemId,
        markdown,
        url: task.url,
        title: task.title,
      });
      if (task.status !== "processing") {
        return;
      }
      task.status = "completed";
      this.emitComplete({
        projectItemId: task.projectItemId,
        markdown,
        url: task.url,
        title: task.title,
        webClipId: savedData?.webClipId,
        contentId: savedData?.contentId,
      });
    } catch (error) {
      if (task.status === "cancelled") {
        return;
      }
      task.status = "error";
      this.emitError({
        projectItemId: task.projectItemId,
        error: error instanceof Error ? error.message : "解析失败",
      });
    }
  }

  private emitProgress(data: WebClipProgressData) {
    Array.from(this.progressHandlers).forEach(handler => handler(data));
  }

  private emitComplete(data: WebClipCompleteData) {
    Array.from(this.completeHandlers).forEach(handler => handler(data));
  }

  private emitError(data: WebClipErrorData) {
    Array.from(this.errorHandlers).forEach(handler => handler(data));
  }
}

export const webClipTaskRunner = new WebClipTaskRunner({
  getLLMConfig: getDefaultLLMConfig,
  chatStream: piStreamChat,
  saveWebClip: saveWebClipToDatabase,
});
