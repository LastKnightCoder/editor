import { notebookTranslator, useNotebookI18n, notebookError } from "@/features/vibe-learning/i18n";
/**
 * 生成配置弹窗（内置生成应用、插件的 Notebook 输出与 PPT / 报告的 AI 编辑共用一张）：
 * 选资料、写要求，按类型多出风格 / 模板，插件输出在中间放插件自己的选项区；「开始」后建好产物占位即关闭，
 * 生成在后台进行，过程在阅读区看。
 */

import { useEffect, useState } from "react";
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
const t = notebookTranslator.t;

const COPY: Record<VLTaskKind, { subtitle: string; placeholder: string }> = {
  outline: {
    get subtitle() {
      return t("generate.outlineSubtitle");
    },
    get placeholder() {
      return t("generate.outlinePlaceholder");
    },
  },
  highlights: {
    get subtitle() {
      return t("generate.highlightsSubtitle");
    },
    get placeholder() {
      return t("generate.highlightsPlaceholder");
    },
  },
  article: {
    get subtitle() {
      return t("generate.articleSubtitle");
    },
    get placeholder() {
      return t("generate.articlePlaceholder");
    },
  },
  mindmap: {
    get subtitle() {
      return t("generate.mindmapSubtitle");
    },
    get placeholder() {
      return t("generate.mindmapPlaceholder");
    },
  },
  ppt: {
    get subtitle() {
      return t("generate.pptSubtitle");
    },
    get placeholder() {
      return t("generate.pptPlaceholder");
    },
  },
  report: {
    get subtitle() {
      return t("generate.reportSubtitle");
    },
    get placeholder() {
      return t("generate.reportPlaceholder");
    },
  },
  quiz: {
    get subtitle() {
      return t("generate.quizSubtitle");
    },
    get placeholder() {
      return t("generate.quizPlaceholder");
    },
  },
  plugin: {
    subtitle: "",
    get placeholder() {
      return t("generate.pluginPlaceholder");
    },
  },
  ppt_edit: {
    get subtitle() {
      return t("generate.editPptSubtitle");
    },
    get placeholder() {
      return t("generate.editPptPlaceholder");
    },
  },
  report_edit: {
    get subtitle() {
      return t("generate.editReportSubtitle");
    },
    get placeholder() {
      return t("generate.editReportPlaceholder");
    },
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
  useNotebookI18n();
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
  const title = isEdit
    ? t("kind.aiEdit")
    : t("generate.title", { kind: output?.definition.title ?? app?.label ?? "" });
  const subtitle = output ? (output.definition.description ?? "") : COPY[kind].subtitle;

  const blocker =
    !isEdit && selection.selectedResourceIds.length === 0
      ? t("generate.selectResource")
      : isEdit && !userPrompt.trim()
        ? t("generate.writeChange")
        : output && pluginBlocker
          ? pluginBlocker
          : null;

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
      toast.error(notebookError(error, "generate.startFailed"));
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
      impact={blocker ?? t("generate.background")}
      footer={
        <>
          <Button variant="secondary" size="sm" disabled={starting} onClick={close}>
            {t("common.cancel")}
          </Button>
          <Button
            variant="primary"
            size="sm"
            icon={Sparkles}
            loading={starting}
            disabled={!!blocker}
            onClick={handleStart}
          >
            {isEdit ? t("generate.rewrite") : t("generate.start")}
          </Button>
        </>
      }
    >
      <DialogBody>
        <div className="flex flex-col gap-4">
          {kind === "quiz" && (
            <Field label={t("quiz.name")} hint={t("generate.quizNameHint")}>
              <Input
                value={quizName}
                onChange={e => setQuizName(e.target.value)}
                placeholder={t("generate.quizNamePlaceholder")}
              />
            </Field>
          )}

          {isEdit && (
            <Field label={t("generate.changes")}>
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
              label={t("generate.articleStyle")}
              options={ARTICLE_STYLES}
              value={style}
              onChange={setStyle}
            />
          )}
          {kind === "ppt" && (
            <TemplatePicker
              kind="ppt"
              label={t("generate.style")}
              templates={PPT_TEMPLATES}
              value={templateId}
              onChange={setTemplateId}
              partition="persist:ppt-template-preview"
            />
          )}
          {kind === "report" && (
            <TemplatePicker
              kind="report"
              label={t("generate.reportStyle")}
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
            <Field label={t("generate.requirements")} hint={t("generate.optional")}>
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
