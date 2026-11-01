/**
 * 生成配置弹窗（内置生成应用、插件的 Notebook 输出与 PPT / 报告的 AI 编辑共用一张）：
 * 选资料、写要求，按类型多出风格 / 模板，插件输出在中间放插件自己的选项区；「开始」后建好产物占位即关闭，
 * 生成在后台进行，过程在阅读区看。
 */

import { useEffect, useMemo, useState } from "react";
import { Sparkles } from "lucide-react";
import { useMemoizedFn } from "ahooks";
import { Button, Dialog, DialogBody, Input, Textarea, toast } from "@tau/ui";
import type { JsonValue } from "@tau/plugins";

import useVLResourceSelection from "@/hooks/useVLResourceSelection";
import { PPT_TEMPLATES, DEFAULT_TEMPLATE_ID } from "@/constants/ppt-templates";
import { REPORT_TEMPLATES, DEFAULT_REPORT_TEMPLATE_ID } from "@/constants/report-templates";
import type { VideoEbookRewriteStyle } from "@/constants/prompts/video-ebook-rewrite";
import type { VLNote } from "@/types/vibe-learning";
import {
  PluginNotebookSlot,
  notebookOutputIcon,
  useGrantNotebook,
  type RegisteredPluginNotebookOutput,
} from "@/app/plugins/notebook-outputs";

import { GENERATE_APPS, NOTE_ICONS } from "../appMeta";
import { startVLTask } from "../tasks/runner";
import type { VLTaskKind } from "../tasks/store";
import { Field, OptionCards, ResourceChecklist, TemplatePicker } from "./fields";
import { ARTICLE_STYLES } from "./styles";

const COPY: Record<VLTaskKind, { subtitle: string; placeholder: string }> = {
  outline: {
    subtitle: "梳理成结构化的学习路径",
    placeholder: "例如：重点关注核心概念，按难度递进排列",
  },
  highlights: { subtitle: "提取核心知识点", placeholder: "例如：重点关注概念和公式，适合考试复习" },
  article: {
    subtitle: "写成一篇可直接阅读的长文",
    placeholder: "例如：多讲背景动机、实际案例和常见误区",
  },
  mindmap: { subtitle: "把知识结构画成导图", placeholder: "例如：按主题分类，层级不超过四层" },
  ppt: { subtitle: "生成一份演示文稿", placeholder: "例如：面向初学者，15 页以内" },
  report: { subtitle: "生成一份分析报告", placeholder: "例如：侧重对比分析，给出结论建议" },
  quiz: { subtitle: "出一套自测题", placeholder: "例如：重点考察 XXX 概念，难度适中" },
  plugin: { subtitle: "", placeholder: "例如：重点讲哪些部分、写给谁看" },
  ppt_edit: {
    subtitle: "按你的要求改写这份演示文稿",
    placeholder: "例如：第 3 页加一个流程图，整体配色更克制",
  },
  report_edit: {
    subtitle: "按你的要求改写这份报告",
    placeholder: "例如：补一节风险分析，结论更简练",
  },
};

export interface GenerateDialogProps {
  kind: VLTaskKind;
  projectId: number;
  mainDbName: string;
  /** AI 编辑的目标 */
  note?: VLNote;
  /** kind 为 plugin 时：插件的 Notebook 输出 */
  output?: RegisteredPluginNotebookOutput;
  notebookTitle: string;
  onClose: () => void;
  /** 任务已启动（产物占位已建好） */
  onStarted: (result: {
    taskId: string;
    note?: VLNote;
    quizSetId?: number;
    pluginEntityId?: number;
  }) => void;
}

export function GenerateDialog({
  kind,
  projectId,
  mainDbName,
  note,
  output,
  notebookTitle,
  onClose,
  onStarted,
}: GenerateDialogProps) {
  const isEdit = kind === "ppt_edit" || kind === "report_edit";
  const [open, setOpen] = useState(true);
  const [starting, setStarting] = useState(false);
  const [userPrompt, setUserPrompt] = useState("");
  const [style, setStyle] = useState<VideoEbookRewriteStyle>("magazine");
  const [templateId, setTemplateId] = useState(
    kind === "report" ? DEFAULT_REPORT_TEMPLATE_ID : DEFAULT_TEMPLATE_ID
  );
  const [quizName, setQuizName] = useState("");
  const [pluginOptions, setPluginOptions] = useState<JsonValue | undefined>(undefined);
  const [pluginBlocker, setPluginBlocker] = useState<string | null>(null);
  const grantNotebook = useGrantNotebook();
  const PluginOptions = output?.definition.options;

  // AI 编辑默认不带参考资料；生成默认全选（或「基于这份资料」预选的那一份）
  const selection = useVLResourceSelection(projectId, { defaultSelectAll: !isEdit });
  const { loadResources } = selection;
  useEffect(() => {
    void loadResources();
  }, [loadResources]);

  const app = GENERATE_APPS.find(a => a.key === kind);
  const Icon = isEdit
    ? NOTE_ICONS[kind === "ppt_edit" ? "ppt" : "report"]
    : output
      ? notebookOutputIcon(output)
      : (app?.icon ?? Sparkles);
  const title = isEdit ? "AI 编辑" : `生成${output?.definition.title ?? app?.label ?? ""}`;
  const subtitle = output ? (output.definition.description ?? "") : COPY[kind].subtitle;

  const blocker = useMemo(() => {
    if (!isEdit && selection.selectedResourceIds.length === 0) return "至少选择一份资料";
    if (isEdit && !userPrompt.trim()) return "写下要怎么改";
    if (output && pluginBlocker) return pluginBlocker;
    return null;
  }, [isEdit, output, selection.selectedResourceIds.length, userPrompt, pluginBlocker]);

  const close = () => setOpen(false);

  const handleStart = useMemoizedFn(async () => {
    if (blocker) {
      toast.warning(blocker);
      return;
    }
    setStarting(true);
    try {
      const picked = selection.getSelectedResources();
      const result = await startVLTask({
        kind,
        projectId,
        mainDbName,
        resourceIds: picked.map(r => r.id),
        resourceNames: picked.map(r => r.name),
        userPrompt: userPrompt.trim() || undefined,
        style,
        templateId,
        quizName:
          quizName.trim() ||
          (picked.length === 1 ? `${picked[0].name.replace(/\.[^.]+$/, "")} 测验` : undefined),
        plugin: output
          ? {
              output,
              options: pluginOptions,
              notebookTitle,
              grantNotebook: () => grantNotebook(output.context.pluginId, projectId),
            }
          : undefined,
        note,
      });
      onStarted(result);
      close();
    } catch (error) {
      toast.error((error as Error).message || "启动失败");
      setStarting(false);
    }
  });

  return (
    <Dialog
      open={open}
      onOpenChange={next => !next && close()}
      onAfterClose={onClose}
      title={title}
      icon={<Icon className="size-4" strokeWidth={1.75} />}
      subtitle={subtitle || undefined}
      context={isEdit ? note?.title : undefined}
      width={kind === "ppt" || kind === "report" ? 720 : output ? 640 : 560}
      locked={starting}
      impact={blocker ?? "开始后在后台生成，可以离开这个页面"}
      footer={
        <>
          <Button variant="secondary" size="sm" disabled={starting} onClick={close}>
            取消
          </Button>
          <Button
            variant="primary"
            size="sm"
            icon={Sparkles}
            loading={starting}
            disabled={!!blocker}
            onClick={handleStart}
          >
            {isEdit ? "开始改写" : "开始生成"}
          </Button>
        </>
      }
    >
      <DialogBody>
        <div className="flex flex-col gap-4">
          {kind === "quiz" && (
            <Field label="测验名称" hint="可选，留空按资料命名">
              <Input
                value={quizName}
                onChange={e => setQuizName(e.target.value)}
                placeholder="例如：第 3 章自测"
              />
            </Field>
          )}

          {isEdit && (
            <Field label="修改要求">
              <Textarea
                data-autofocus
                value={userPrompt}
                onChange={e => setUserPrompt(e.target.value)}
                placeholder={COPY[kind].placeholder}
                rows={4}
              />
            </Field>
          )}

          <ResourceChecklist
            resources={selection.resources}
            selectedIds={selection.selectedResourceIds}
            loading={selection.loading}
            allSelected={selection.isAllSelected}
            onToggle={selection.toggleResource}
            onToggleAll={selection.toggleAll}
            optional={isEdit}
          />

          {kind === "article" && (
            <OptionCards
              label="文章风格"
              options={ARTICLE_STYLES}
              value={style}
              onChange={setStyle}
            />
          )}
          {kind === "ppt" && (
            <TemplatePicker
              label="风格"
              templates={PPT_TEMPLATES}
              value={templateId}
              onChange={setTemplateId}
              partition="persist:ppt-template-preview"
            />
          )}
          {kind === "report" && (
            <TemplatePicker
              label="报告风格"
              templates={REPORT_TEMPLATES}
              value={templateId}
              onChange={setTemplateId}
              partition="persist:report-template-preview"
            />
          )}

          {output && PluginOptions && (
            <PluginNotebookSlot output={output} resetKeys={[output.id]}>
              <PluginOptions
                context={output.context}
                target={{
                  notebook: { id: String(projectId), title: notebookTitle },
                  resources: selection
                    .getSelectedResources()
                    .map(r => ({ id: String(r.id), name: r.name })),
                }}
                value={pluginOptions}
                onChange={setPluginOptions}
                setBlocker={setPluginBlocker}
              />
            </PluginNotebookSlot>
          )}

          {!isEdit && (
            <Field label="额外要求" hint="可选">
              <Textarea
                value={userPrompt}
                onChange={e => setUserPrompt(e.target.value)}
                placeholder={COPY[kind].placeholder}
                rows={3}
              />
            </Field>
          )}
        </div>
      </DialogBody>
    </Dialog>
  );
}
