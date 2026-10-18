/**
 * Vibe Learning 生成任务执行器（模块级，不随组件卸载）：
 * 建产物占位 → 带本项目的资料检索工具跑模型 → 逐轮记录推理 / 工具 / 正文 → 按类型落库。
 * 离开页面任务照跑；状态写进 useVLTaskStore 供目录与执行过程页订阅。
 */

import type { Descendant } from "slate";
import { createContent, getContentById, updateContent } from "@/commands";
import { createVLNote, updateVLNote } from "@/commands/vibe-learning";
import { createPodcast } from "@/commands/podcast";
import { createVLQuizSet, createVLQuizItemsBatch } from "@/commands/vl-quiz";
import { bindDatabaseCommands } from "@/services/command-context";
import { runGenerationTask, type GenerationRequest } from "@/services/generation-orchestrator";
import { parseScript } from "@/services/podcast";
import useSettingStore from "@/stores/useSettingStore";
import { TTSProviderFactory } from "@/utils/tts";
import type { ITTSProvider } from "@/types/tts";
import { invalidateQuizzes } from "../../../quizQueries";
import { queryClient } from "@/queryClient";
import { createUnifiedVibeLearningTool } from "@/tools/vibeLearningSearchTool";
import { cleanPPTHtmlContent } from "@/constants/prompts/ppt-generation";
import { cleanReportHtmlContent } from "@/constants/prompts/report-generation";
import { getTemplateById, getDefaultTemplate } from "@/constants/ppt-templates";
import { getReportTemplateById, getDefaultReportTemplate } from "@/constants/report-templates";
import type { VideoEbookRewriteStyle } from "@/constants/prompts/video-ebook-rewrite";
import type { LLMModelSetting, LLMProviderSetting } from "@/types/pi-llm";
import type { PodcastSpeaker } from "@/types/podcast";
import type { VLNote, VLNoteType } from "@/types/vibe-learning";
import { getContentLength, getMarkdown, importFromMarkdown } from "@/utils";
import { parsePartialQuizPrompts, parseQuizResponse } from "./quizParse";
import { synthesizePodcast } from "./podcastAudio";
import { useVLTaskStore, type VLTask, type VLTaskKind, type VLTaskTurn } from "./store";

export interface VLTaskInput {
  /** 只约束任务交接前的准备；已启动任务由 cancelVLTask 管理。 */
  startSignal?: AbortSignal;
  kind: VLTaskKind;
  projectId: number;
  mainDbName: string;
  resourceIds: number[];
  resourceNames: string[];
  userPrompt?: string;
  /** 文章风格 */
  style?: VideoEbookRewriteStyle;
  /** PPT / 报告模板 */
  templateId?: string;
  /** 测验集名称 */
  quizName?: string;
  /** 笔记类产物的标题（缺省用类型名；PPT / 报告落库时改用 HTML 里的标题） */
  title?: string;
  podcast?: { name: string; speakers: PodcastSpeaker[]; durationMin: number; durationMax: number };
  /** AI 编辑的目标笔记 */
  note?: VLNote;
}

/** 笔记类产物的类型与占位标题 */
const NOTE_KIND: Partial<Record<VLTaskKind, { type: VLNoteType; title: string }>> = {
  outline: { type: "outline", title: "学习大纲" },
  highlights: { type: "highlights", title: "重点提炼" },
  article: { type: "article", title: "学习文章" },
  mindmap: { type: "mindmap", title: "思维导图" },
  ppt: { type: "ppt", title: "演示文稿" },
  report: { type: "report", title: "报告" },
  podcast: { type: "podcast", title: "播客" },
};

/** 正文可以边生成边落库的类型（中途关应用也留得住已写的部分） */
const LIVE_SAVE: VLTaskKind[] = ["outline", "highlights", "article"];
/** 停止 / 失败时半截输出仍然可用的类型（HTML、JSON、播客脚本的半截不可用） */
const KEEP_PARTIAL: VLTaskKind[] = [...LIVE_SAVE, "mindmap"];

const EMPTY_CONTENT: Descendant[] = [
  { type: "paragraph", children: [{ type: "formatted", text: "" }] },
] as unknown as Descendant[];

interface Runtime {
  tts?: ITTSProvider;
  ttsController?: AbortController;
  input: VLTaskInput;
  contentId?: number;
  controller?: AbortController;
  cancelled: boolean;
}
const runtimes = new Map<string, Runtime>();

const commandsFor = (databaseName: string, signal?: AbortSignal) =>
  bindDatabaseCommands(
    {
      createContent,
      getContentById,
      updateContent,
      createVLNote,
      updateVLNote,
      createPodcast,
      createVLQuizSet,
      createVLQuizItemsBatch,
    },
    { databaseName, signal }
  );

function llmConfig(feature: "chat" | "podcastGeneration"): {
  provider: LLMProviderSetting;
  model: LLMModelSetting;
} {
  const { llmProviders: llmConfigs, llmUsageSettings } = useSettingStore.getState().setting;
  const usage = llmUsageSettings[feature];
  const provider = usage ? llmConfigs.find(c => c.id === usage.providerId) : undefined;
  const model = usage ? provider?.models?.find(m => m.id === usage.modelId) : undefined;
  if (!provider || !model) {
    throw new Error(
      feature === "podcastGeneration"
        ? "请先在设置中配置播客生成的 AI 模型"
        : "请先在设置中配置 AI 模型"
    );
  }
  return { provider, model };
}

const htmlTitle = (html: string) => html.match(/<title>(.*?)<\/title>/i)?.[1]?.trim();
const htmlToNoteContent = (html: string) => importFromMarkdown(`\`\`\`html\n${html}\n\`\`\``);

/** 节流写 store：流式回调很密，80ms 合并一次 */
function createWriter(id: string) {
  let pending: ((t: VLTask) => Partial<VLTask>)[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;
  const flush = () => {
    timer = null;
    const batch = pending;
    pending = [];
    if (batch.length === 0) return;
    useVLTaskStore.getState().patch(id, task => {
      let draft = { ...task };
      for (const fn of batch) draft = { ...draft, ...fn(draft) };
      return draft;
    });
  };
  return {
    queue(fn: (t: VLTask) => Partial<VLTask>) {
      pending.push(fn);
      if (!timer) timer = setTimeout(flush, 80);
    },
    flush() {
      if (timer) clearTimeout(timer);
      flush();
    },
  };
}

function upsertTurn(
  turns: VLTaskTurn[],
  turnId: string | undefined,
  fn: (t: VLTaskTurn) => VLTaskTurn
) {
  const id = turnId ?? turns[turns.length - 1]?.id ?? "t0";
  const index = turns.findIndex(t => t.id === id);
  const base: VLTaskTurn = index >= 0 ? turns[index] : { id, reasoning: "", tools: [], text: "" };
  const next = [...turns];
  if (index >= 0) next[index] = fn(base);
  else next.push(fn(base));
  return next;
}

async function buildRequest(
  input: VLTaskInput,
  currentHtml: string | undefined,
  runtime: Runtime
): Promise<GenerationRequest> {
  const sourcePayload = {
    projectId: input.projectId,
    mainDbName: input.mainDbName,
    resourceNames: input.resourceNames,
    userPrompt: input.userPrompt || undefined,
  };
  const base = { sourceType: "vibe_learning" as const, sourcePayload };
  switch (input.kind) {
    case "article":
      return { ...base, taskType: "article", taskPayload: { style: input.style ?? "magazine" } };
    case "ppt":
      return {
        ...base,
        taskType: "ppt",
        taskPayload: {
          template: (input.templateId && getTemplateById(input.templateId)) || getDefaultTemplate(),
        },
      };
    case "report":
      return {
        ...base,
        taskType: "report",
        taskPayload: {
          template:
            (input.templateId && getReportTemplateById(input.templateId)) ||
            getDefaultReportTemplate(),
        },
      };
    case "ppt_edit":
    case "report_edit":
      return { ...base, taskType: input.kind, taskPayload: { currentHtml: currentHtml ?? "" } };
    case "podcast": {
      return {
        ...base,
        taskType: "podcast",
        taskPayload: {
          speakers: input.podcast?.speakers ?? [],
          // prompt 标签规则须与实际合成引擎对齐，从当前语音服务派生
          ttsPromptOptions: {
            textInstructions:
              (await runtime.tts?.getTextInstructions?.(runtime.ttsController?.signal)) ??
              "只输出可朗读的纯文本，不加入语音控制标签。",
          },
          durationMin: input.podcast?.durationMin,
          durationMax: input.podcast?.durationMax,
        },
      };
    }
    default:
      return { ...base, taskType: input.kind, taskPayload: {} } as GenerationRequest;
  }
}

/** AI 编辑：读出笔记当前的 HTML */
async function loadCurrentHtml(
  note: VLNote,
  kind: "ppt_edit" | "report_edit",
  databaseName: string,
  signal?: AbortSignal
) {
  const content = await commandsFor(databaseName, signal).getContentById(note.contentId);
  const markdown = content ? getMarkdown(content.content) : "";
  const html =
    kind === "ppt_edit" ? cleanPPTHtmlContent(markdown) : cleanReportHtmlContent(markdown);
  if (!html.trim()) throw new Error("无法读取当前内容");
  return html;
}

/**
 * 启动任务：同步建好产物占位（失败直接抛给调用方，弹窗留着），随后在后台执行。
 * 返回新建 / 目标笔记，调用方据此在阅读区打开执行过程。
 */
export async function startVLTask(
  input: VLTaskInput,
  reuse?: { taskId: string; noteId?: number; quizSetId?: number; contentId?: number }
): Promise<{ taskId: string; note?: VLNote; quizSetId?: number }> {
  const { startSignal, ...taskInput } = input;
  input = taskInput;
  startSignal?.throwIfAborted();
  const commands = commandsFor(input.mainDbName, startSignal);
  const config = llmConfig(input.kind === "podcast" ? "podcastGeneration" : "chat");
  const store = useVLTaskStore.getState();
  const taskId = reuse?.taskId ?? `vl-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  let note: VLNote | undefined = input.note;
  let quizSetId = reuse?.quizSetId;
  let contentId = reuse?.contentId ?? input.note?.contentId;
  let title = input.note?.title ?? "";
  let currentHtml: string | undefined;

  if (input.kind === "ppt_edit" || input.kind === "report_edit") {
    if (!input.note) throw new Error("缺少要编辑的产物");
    currentHtml = await loadCurrentHtml(input.note, input.kind, input.mainDbName, startSignal);
  } else if (input.kind === "quiz") {
    title = input.quizName?.trim() || "测验";
    if (!quizSetId) {
      const quizSet = await commands.createVLQuizSet({
        projectId: input.projectId,
        name: title,
        emoji: "📝",
        resourceIds: input.resourceIds,
        prompt: input.userPrompt || undefined,
      });
      quizSetId = quizSet.id;
      void invalidateQuizzes(queryClient, input.mainDbName);
    }
  } else {
    const meta = NOTE_KIND[input.kind];
    if (!meta) throw new Error(`不支持的生成类型：${input.kind}`);
    title =
      input.kind === "podcast"
        ? input.podcast?.name.trim() || meta.title
        : input.title?.trim() || meta.title;
    if (!reuse?.noteId) {
      const newContentId = await commands.createContent(
        EMPTY_CONTENT,
        getContentLength(EMPTY_CONTENT)
      );
      if (!newContentId) throw new Error("创建内容失败");
      contentId = newContentId;
      note = await commands.createVLNote({
        projectId: input.projectId,
        contentId: newContentId,
        title,
        type: meta.type,
      });
    }
  }

  const noteId = reuse?.noteId ?? note?.id;
  startSignal?.throwIfAborted();
  store.put({
    id: taskId,
    databaseName: input.mainDbName,
    projectId: input.projectId,
    kind: input.kind,
    title,
    noteId,
    quizSetId,
    status: "running",
    phase: "分析资料",
    startedAt: Date.now(),
    turns: [],
    output: "",
    outputTokens: 0,
    resourceNames: input.resourceNames,
    userPrompt: input.userPrompt,
  });
  store.bumpProducts(input.projectId);

  const runtime: Runtime = { input, contentId, cancelled: false };
  runtimes.set(taskId, runtime);
  void execute(taskId, runtime, config, currentHtml);
  return { taskId, note, quizSetId };
}

export function cancelVLTask(taskId: string) {
  const runtime = runtimes.get(taskId);
  if (!runtime) return;
  runtime.cancelled = true;
  runtime.controller?.abort();
  runtime.ttsController?.abort();
}

/** 失败 / 停止后按原配置重跑，写回同一个产物 */
export async function retryVLTask(taskId: string) {
  const task = useVLTaskStore.getState().tasks[taskId];
  const runtime = runtimes.get(taskId);
  if (!task || !runtime) throw new Error("任务已失效，请重新发起");
  await startVLTask(runtime.input, {
    taskId,
    noteId: task.noteId,
    quizSetId: task.quizSetId,
    contentId: runtime.contentId,
  });
}

async function execute(
  taskId: string,
  runtime: Runtime,
  config: { provider: LLMProviderSetting; model: LLMModelSetting },
  currentHtml?: string
) {
  try {
    await executeInner(taskId, runtime, config, currentHtml);
  } finally {
    runtime.ttsController?.abort();
    await runtime.tts?.synthesis
      ?.dispose?.()
      .catch(error => console.error("回收播客语音任务失败", error));
    runtime.tts = undefined;
    runtime.ttsController = undefined;
  }
}

async function executeInner(
  taskId: string,
  runtime: Runtime,
  config: { provider: LLMProviderSetting; model: LLMModelSetting },
  currentHtml?: string
) {
  const { input } = runtime;
  const commands = commandsFor(input.mainDbName);
  const writer = createWriter(taskId);
  const store = useVLTaskStore.getState;
  const tool = createUnifiedVibeLearningTool(input.projectId, input.mainDbName);
  let liveSaved = "";
  let liveTimer: ReturnType<typeof setInterval> | null = null;

  if (LIVE_SAVE.includes(input.kind) && runtime.contentId) {
    const contentId = runtime.contentId;
    liveTimer = setInterval(() => {
      const output = store().tasks[taskId]?.output ?? "";
      if (!output || output === liveSaved) return;
      liveSaved = output;
      void commands
        .updateContent(contentId, importFromMarkdown(output))
        .catch(error => console.error("[vl-task] 中途保存失败", error));
    }, 3000);
  }

  const finish = (patch: Partial<VLTask>) => {
    if (liveTimer) clearInterval(liveTimer);
    writer.flush();
    store().patch(taskId, { ...patch, finishedAt: Date.now() });
    store().bumpProducts(input.projectId);
  };

  let content: string;
  try {
    if (input.kind === "podcast") {
      runtime.tts = TTSProviderFactory.getTTSProvider() ?? undefined;
      if (!runtime.tts?.synthesis) throw new Error("请先配置TTS服务提供商");
      runtime.ttsController = new AbortController();
      if (runtime.cancelled) runtime.ttsController.abort();
    }
    const request = await buildRequest(input, currentHtml, runtime);
    if (runtime.cancelled) throw new DOMException("已停止", "AbortError");
    content = await new Promise<string>((resolve, reject) => {
      const signal = runtime.tts?.synthesis?.signal;
      let settled = false;
      const canReceive = () =>
        !settled && !runtime.cancelled && !signal?.aborted && runtimes.get(taskId) === runtime;
      const stopped = () => {
        settled = true;
        reject(signal?.reason ?? new DOMException("任务已停止", "AbortError"));
      };
      if (signal?.aborted) {
        stopped();
        return;
      }
      signal?.addEventListener("abort", stopped, { once: true });
      runGenerationTask(
        config.provider,
        config.model,
        request,
        {
          onController: controller => {
            runtime.controller = controller;
            if (runtime.cancelled || signal?.aborted) controller.abort();
            else signal?.addEventListener("abort", () => controller.abort(), { once: true });
          },
          onReasoning: (text, turnId) =>
            canReceive() &&
            writer.queue(t => ({
              phase: "思考中",
              turns: upsertTurn(t.turns, turnId, turn => ({
                ...turn,
                reasoning: text,
                reasoningStart: turn.reasoningStart ?? Date.now(),
              })),
            })),
          onToolCallsUpdate: (executions, turnId) =>
            canReceive() &&
            writer.queue(t => ({
              phase: "查阅资料",
              turns: upsertTurn(t.turns, turnId, turn => ({
                ...turn,
                tools: executions,
                reasoningEnd: turn.reasoningStart ? (turn.reasoningEnd ?? Date.now()) : undefined,
              })),
            })),
          onUpdate: (text, turnId) =>
            canReceive() &&
            writer.queue(t => ({
              phase: "输出中",
              output: text,
              quizPrompts: input.kind === "quiz" ? parsePartialQuizPrompts(text) : t.quizPrompts,
              turns: upsertTurn(t.turns, turnId, turn => ({
                ...turn,
                text,
                reasoningEnd: turn.reasoningStart ? (turn.reasoningEnd ?? Date.now()) : undefined,
              })),
            })),
          onUsage: usage =>
            runtimes.get(taskId) === runtime &&
            writer.queue(t => ({ outputTokens: t.outputTokens + (usage.outputTokens || 0) })),
          onFinish: text => {
            signal?.removeEventListener("abort", stopped);
            if (!canReceive()) {
              stopped();
              return;
            }
            settled = true;
            resolve(text);
          },
          onError: error => {
            signal?.removeEventListener("abort", stopped);
            settled = true;
            reject(error);
          },
        },
        {
          additionalTools: [
            {
              type: "function",
              function: {
                name: tool.name,
                description: tool.description,
                parameters: tool.parameters as Record<string, unknown>,
              },
            },
          ],
          databaseName: input.mainDbName,
          executeToolCall: async (call, options) => {
            if (call.function.name !== tool.name) return null;
            const args = call.function.arguments ? JSON.parse(call.function.arguments) : {};
            const result = await tool.executor(args, {
              toolName: tool.name,
              toolCallId: call.id,
              source: "vibe-learning",
              databaseName: input.mainDbName,
              signal: options?.signal,
            });
            return typeof result === "string" ? { content: result } : (result ?? { content: "" });
          },
        }
      );
    });
  } catch (error) {
    // 已写出的正文照常落库（仅半截也可用的类型），产物不白费
    const partial = store().tasks[taskId]?.output ?? "";
    if (partial && KEEP_PARTIAL.includes(input.kind)) {
      await persist(taskId, runtime, partial).catch(e =>
        console.error("[vl-task] 保存已输出部分失败", e)
      );
    }
    if (runtime.cancelled) finish({ status: "cancelled", phase: "已停止" });
    else finish({ status: "failed", phase: "失败", error: (error as Error).message || "生成失败" });
    return;
  }

  try {
    writer.flush();
    store().patch(taskId, { output: content, phase: "保存中" });
    await persist(taskId, runtime, content);
    finish({ status: "succeeded", phase: "已完成" });
  } catch (error) {
    if (runtime.cancelled) finish({ status: "cancelled", phase: "已停止" });
    else finish({ status: "failed", phase: "失败", error: (error as Error).message || "保存失败" });
  }
}

/** 按类型把模型输出写进产物 */
async function persist(taskId: string, runtime: Runtime, content: string) {
  const { input, contentId } = runtime;
  const taskSignals = [runtime.ttsController?.signal, runtime.tts?.synthesis?.signal].filter(
    (signal): signal is AbortSignal => Boolean(signal)
  );
  const commands = commandsFor(
    input.mainDbName,
    taskSignals.length ? AbortSignal.any(taskSignals) : undefined
  );
  const task = useVLTaskStore.getState().tasks[taskId];
  switch (input.kind) {
    case "outline":
    case "highlights":
    case "article":
    case "mindmap":
      if (contentId) await commands.updateContent(contentId, importFromMarkdown(content.trim()));
      return;
    case "ppt":
    case "report":
    case "ppt_edit":
    case "report_edit": {
      const isPPT = input.kind === "ppt" || input.kind === "ppt_edit";
      const html = isPPT ? cleanPPTHtmlContent(content) : cleanReportHtmlContent(content);
      if (!html.trim()) throw new Error("没有解析出可用的 HTML");
      if (!contentId) return;
      await commands.updateContent(contentId, htmlToNoteContent(html));
      const title = htmlTitle(html);
      if (task?.noteId && title) {
        await commands.updateVLNote({ id: task.noteId, title });
        useVLTaskStore.getState().patch(taskId, { title });
      }
      return;
    }
    case "quiz": {
      const quizSetId = task?.quizSetId;
      if (!quizSetId) return;
      const items = parseQuizResponse(content);
      if (items.length === 0) throw new Error("没有解析出题目");
      await commands.createVLQuizItemsBatch(
        items.map((item, index) => ({
          quizSetId,
          type: item.type,
          prompt: item.prompt,
          detail: item.detail,
          data: item.data,
          tags: item.tags,
          difficulty: item.difficulty,
          sortOrder: index,
        }))
      );
      void invalidateQuizzes(queryClient, input.mainDbName);
      return;
    }
    case "podcast": {
      const speakers = input.podcast?.speakers ?? [];
      const lines = parseScript(content, speakers);
      if (lines.length === 0) throw new Error("脚本解析失败，未找到有效的对话行");
      const patch = useVLTaskStore.getState().patch;
      patch(taskId, { phase: "合成语音", progress: { done: 0, total: lines.length } });
      const controller = runtime.ttsController;
      if (!controller || !runtime.tts?.synthesis) throw new Error("播客语音任务已结束");
      runtime.controller = controller;
      if (runtime.cancelled) controller.abort();
      const audio = await synthesizePodcast(
        lines,
        {
          signal: controller.signal,
          onProgress: (done, total) => patch(taskId, { progress: { done, total } }),
          onPhase: phase => patch(taskId, { phase }),
        },
        runtime.tts.synthesis
      );
      controller.signal.throwIfAborted();
      runtime.tts.synthesis.signal?.throwIfAborted();
      const name = input.podcast?.name.trim() || "播客";
      const podcast = await commands.createPodcast({
        name,
        audioUrl: audio.audioUrl,
        script: content,
        scriptLines: audio.lines,
        duration: audio.duration,
        speakers,
      });
      const script = audio.lines.map(line => `**${line.speaker}**: ${line.text}`).join("\n\n");
      if (contentId)
        await commands.updateContent(contentId, importFromMarkdown(`# ${name}\n\n${script}`));
      if (task?.noteId) await commands.updateVLNote({ id: task.noteId, podcastId: podcast.id });
      return;
    }
  }
}
