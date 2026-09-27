/**
 * Vibe Learning 对话里的产物工具（作用域工具，只给本项目的对话）：
 *  - vibe_learning_generate：结合对话把要求浓缩成 brief，走与生成弹窗相同的后台任务
 *  - vibe_learning_save_note：对话里已经写好的内容直接存成产物，不再重新生成
 * 产物建好即出现在左侧产物列表（任务 bumpProducts 驱动刷新），对话里渲染产物卡片。
 * 风格按名称选、这里换算成模板 id；缺必要信息时返回参数错误，引导模型用 ask-question 问用户。
 */

import { createContent } from "@/commands";
import { createVLNote, getVLResourcesByProjectId } from "@/commands/vibe-learning";
import { PPT_TEMPLATES } from "@/constants/ppt-templates";
import { REPORT_TEMPLATES } from "@/constants/report-templates";
import type { ToolDefinition, ToolExecutionResult } from "@/types";
import type { VideoEbookRewriteStyle } from "@/constants/prompts/video-ebook-rewrite";
import type { VLNoteType } from "@/types/vibe-learning";
import { getContentLength, importFromMarkdown } from "@/utils";
import { ASK_QUESTION_TOOL_NAME } from "@/tools/askQuestionTypes";
import { GENERATE_APPS, type GenerateAppKey } from "../appMeta";
import { ARTICLE_STYLES } from "../generate/styles";
import { startVLTask } from "../tasks/runner";
import { useVLTaskStore } from "../tasks/store";
import { VL_PRODUCT_RENDERER_KEY, type VLProductPayload } from "./productPayload";

/** 播客要选音色、依赖 TTS 配置，暂不开放给对话 */
const GENERATE_KINDS = GENERATE_APPS.filter(app => app.key !== "podcast");
const SAVE_TYPES: { type: VLNoteType; label: string; hint: string }[] = [
  { type: "note", label: "笔记", hint: "普通 Markdown" },
  { type: "outline", label: "学习大纲", hint: "Markdown 标题 / 列表分层" },
  { type: "highlights", label: "重点提炼", hint: "Markdown" },
  { type: "article", label: "文章", hint: "Markdown 长文" },
  {
    type: "mindmap",
    label: "思维导图",
    hint: "用 # / ## / ### 或嵌套列表表示层级，根节点只有一个",
  },
];

interface StyleOption {
  label: string;
  description: string;
  value: string;
}

const STYLE_OPTIONS: Partial<Record<GenerateAppKey, StyleOption[]>> = {
  article: ARTICLE_STYLES.map(s => ({
    label: s.label,
    description: s.description,
    value: s.value,
  })),
  ppt: PPT_TEMPLATES.map(t => ({ label: t.name, description: t.description, value: t.id })),
  report: REPORT_TEMPLATES.map(t => ({ label: t.name, description: t.description, value: t.id })),
};
/** 必须由用户选定风格的类型（视觉差异大，不替用户做主）；文章缺省用杂志长文 */
const STYLE_REQUIRED: GenerateAppKey[] = ["ppt", "report"];

const paramError = (content: string): ToolExecutionResult => ({ content, isParameterError: true });

const listStyles = (options: StyleOption[]) =>
  options.map(o => `- ${o.label}：${o.description}`).join("\n");

const productResult = (payload: VLProductPayload, message: string): ToolExecutionResult => ({
  content: JSON.stringify({ status: "ok", title: payload.title, message }),
  metadata: { render: { rendererKey: VL_PRODUCT_RENDERER_KEY, payload } },
});

const asString = (value: unknown) => (typeof value === "string" ? value.trim() : "");

function createGenerateTool(projectId: number, mainDbName: string): ToolDefinition {
  const styleHint = (["article", "ppt", "report"] as const)
    .map(kind => {
      const label = GENERATE_APPS.find(a => a.key === kind)?.label;
      return `${label}：${(STYLE_OPTIONS[kind] ?? []).map(o => o.label).join("、")}`;
    })
    .join("；");

  return {
    name: "vibe_learning_generate",
    description:
      "基于当前项目资料在后台生成学习产物（大纲、重点、文章、导图、PPT、报告、测验），生成完成后出现在左侧产物列表。" +
      "brief 必须结合本次对话写具体：用户关心的主题、范围、深度、受众与偏好，不要只写「生成大纲」。" +
      `PPT / 报告必须先确定风格：用户没说时先用 ${ASK_QUESTION_TOOL_NAME} 让用户选，不要替用户决定。` +
      "工具立即返回，不要等待生成结果，也不要在回复里复述产物内容。" +
      "如果产物内容已经在对话里写好，改用 vibe_learning_save_note 直接保存。",
    execution: { timeoutMs: 60000 },
    parameters: {
      type: "object",
      properties: {
        kind: {
          type: "string",
          enum: GENERATE_KINDS.map(a => a.key),
          description: `产物类型：${GENERATE_KINDS.map(a => `${a.key}=${a.label}`).join("，")}`,
        },
        brief: {
          type: "string",
          description: "结合对话整理出的生成要求（主题、范围、侧重点、受众、篇幅等）",
        },
        title: {
          type: "string",
          description: "产物标题，可选；测验即测验名称。PPT / 报告会以生成内容里的标题为准",
        },
        resources: {
          type: "array",
          items: { type: "string" },
          description:
            "参考的资料名称，可选，不传默认使用全部已就绪资料。名称可通过 vibe_learning_query 的 list 获取",
        },
        style: {
          type: "string",
          description: `风格名称（按名称填写，只对文章 / PPT / 报告有效）。${styleHint}`,
        },
      },
      required: ["kind", "brief"],
      additionalProperties: false,
    },
    executor: async args => {
      const kind = asString(args.kind) as GenerateAppKey;
      const app = GENERATE_KINDS.find(a => a.key === kind);
      if (!app) {
        return paramError(
          `不支持的产物类型：${kind || "未填写"}。可选：${GENERATE_KINDS.map(a => a.key).join("、")}`
        );
      }
      const brief = asString(args.brief);
      if (!brief) return paramError("brief 不能为空：请结合对话写清楚要生成什么、侧重什么。");

      // 风格：按名称匹配，换算成模板 id
      const styleOptions = STYLE_OPTIONS[kind];
      const styleName = asString(args.style);
      let styleValue: string | undefined;
      if (styleOptions) {
        const matched = styleName ? styleOptions.find(o => o.label === styleName) : undefined;
        if (styleName && !matched) {
          return paramError(
            `没有名为「${styleName}」的风格。可选风格：\n${listStyles(styleOptions)}\n` +
              `请从中选一个最符合用户描述的；拿不准时用 ${ASK_QUESTION_TOOL_NAME} 让用户选。`
          );
        }
        if (!matched && STYLE_REQUIRED.includes(kind)) {
          return paramError(
            `生成${app.label}需要先确定风格。请调用 ${ASK_QUESTION_TOOL_NAME} 让用户单选（挑 4~6 个与内容最契合的作为选项，选项文案用风格名称并附一句说明），拿到答案后带上 style 重新调用本工具。可选风格：\n${listStyles(styleOptions)}`
          );
        }
        styleValue = matched?.value;
      }

      // 资料：按名称匹配；只用已转换出文本的
      const ready = (await getVLResourcesByProjectId(projectId)).filter(r => r.markdownPath);
      if (ready.length === 0) return paramError("项目里还没有可用的资料（资料可能还在处理中）。");
      const wanted = Array.isArray(args.resources)
        ? args.resources.map(asString).filter(Boolean)
        : [];
      const unknown = wanted.filter(name => !ready.some(r => r.name === name));
      if (unknown.length > 0) {
        return paramError(
          `找不到资料：${unknown.join("、")}。可用资料：\n${ready.map(r => `- ${r.name}`).join("\n")}`
        );
      }
      const picked = wanted.length > 0 ? ready.filter(r => wanted.includes(r.name)) : ready;

      const title = asString(args.title);
      try {
        const started = await startVLTask({
          kind,
          projectId,
          mainDbName,
          resourceIds: picked.map(r => r.id),
          resourceNames: picked.map(r => r.name),
          userPrompt: brief,
          style:
            kind === "article"
              ? ((styleValue as VideoEbookRewriteStyle | undefined) ?? "magazine")
              : undefined,
          templateId: kind === "ppt" || kind === "report" ? styleValue : undefined,
          quizName: kind === "quiz" ? title || undefined : undefined,
          title: title || undefined,
        });
        const task = useVLTaskStore.getState().tasks[started.taskId];
        return productResult(
          {
            projectId,
            kind,
            title: task?.title ?? app.label,
            mode: "generate",
            taskId: started.taskId,
            noteId: started.note?.id,
            quizSetId: started.quizSetId,
          },
          "已开始在后台生成，完成后会出现在左侧产物列表。告诉用户即可，不要等待或复述内容。"
        );
      } catch (error) {
        return { content: `启动生成失败：${(error as Error).message || "未知错误"}` };
      }
    },
  };
}

function createSaveNoteTool(projectId: number): ToolDefinition {
  return {
    name: "vibe_learning_save_note",
    description:
      "把对话里已经写好的内容直接保存为项目产物（出现在左侧产物列表），不重新生成。" +
      "适合用户说「把这个存下来 / 保存成大纲」等场景；markdown 填完整内容，不要省略。",
    parameters: {
      type: "object",
      properties: {
        type: {
          type: "string",
          enum: SAVE_TYPES.map(t => t.type),
          description: `产物类型：${SAVE_TYPES.map(t => `${t.type}=${t.label}（${t.hint}）`).join("，")}`,
        },
        title: { type: "string", description: "产物标题" },
        markdown: { type: "string", description: "完整的 Markdown 内容" },
      },
      required: ["type", "title", "markdown"],
      additionalProperties: false,
    },
    executor: async args => {
      const meta = SAVE_TYPES.find(t => t.type === asString(args.type));
      if (!meta) {
        return paramError(`不支持的类型。可选：${SAVE_TYPES.map(t => t.type).join("、")}`);
      }
      const markdown = asString(args.markdown);
      if (!markdown) return paramError("markdown 不能为空。");
      const title = asString(args.title) || meta.label;

      const content = importFromMarkdown(markdown);
      const contentId = await createContent(content, getContentLength(content));
      if (!contentId) return { content: "保存失败：创建内容失败" };
      const note = await createVLNote({ projectId, contentId, title, type: meta.type });
      useVLTaskStore.getState().bumpProducts(projectId);
      return productResult(
        {
          projectId,
          kind: meta.type === "note" ? "note" : (meta.type as GenerateAppKey),
          title,
          mode: "save",
          noteId: note.id,
        },
        "已保存到左侧产物列表。"
      );
    },
  };
}

export const createVibeLearningProductTools = (
  projectId: number,
  mainDbName: string
): ToolDefinition[] => [createGenerateTool(projectId, mainDbName), createSaveNoteTool(projectId)];
