/**
 * 生成配置弹窗（8 个生成应用 + PPT / 报告的 AI 编辑共用一张）：
 * 选资料、写要求，按类型多出风格 / 模板 / 播客设置；「开始」后建好产物占位即关闭，
 * 生成在后台进行，过程在阅读区看。
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Sparkles } from "lucide-react";
import { useMemoizedFn } from "ahooks";
import { Button, Dialog, DialogBody, Input, NumberInput, Textarea, toast } from "@tau/ui";

import useVLResourceSelection from "@/hooks/useVLResourceSelection";
import { TTSProviderFactory } from "@/utils/tts";
import { PPT_TEMPLATES, DEFAULT_TEMPLATE_ID } from "@/constants/ppt-templates";
import { REPORT_TEMPLATES, DEFAULT_REPORT_TEMPLATE_ID } from "@/constants/report-templates";
import type { VideoEbookRewriteStyle } from "@/constants/prompts/video-ebook-rewrite";
import { SpeakerRole, type PodcastSpeaker } from "@/types/podcast";
import type { VLNote } from "@/types/vibe-learning";
import { SpeakerConfig } from "@/components/PodcastGenerationModal/SpeakerConfig";
import { VoiceClonePanel } from "@/components/PodcastGenerationModal/VoiceClonePanel";
import { normalizeDurationRange } from "@/components/PodcastGenerationModal/utils";
import type {
  CloneVoiceItem,
  NoticeType,
  VoiceOption,
} from "@/components/PodcastGenerationModal/types";

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
  podcast: { subtitle: "生成一期双人对话播客", placeholder: "例如：重点讨论 XXX，风格轻松幽默" },
  ppt_edit: {
    subtitle: "按你的要求改写这份演示文稿",
    placeholder: "例如：第 3 页加一个流程图，整体配色更克制",
  },
  report_edit: {
    subtitle: "按你的要求改写这份报告",
    placeholder: "例如：补一节风险分析，结论更简练",
  },
};

const DEFAULT_SPEAKERS: PodcastSpeaker[] = [
  { name: "主持人", voiceId: "", voiceName: "", role: SpeakerRole.Host },
  { name: "嘉宾", voiceId: "", voiceName: "", role: SpeakerRole.Guest },
];

const notifyToast = (type: NoticeType, text: string) =>
  (type === "success"
    ? toast.success
    : type === "error"
      ? toast.error
      : type === "warning"
        ? toast.warning
        : toast.info)(text);

/** 播客音色列表（TTS 服务提供） */
function usePodcastVoices(enabled: boolean) {
  const [voices, setVoices] = useState<VoiceOption[]>([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    const synthesizer = TTSProviderFactory.getSpeechSynthesizer();
    if (!synthesizer) {
      toast.error("请先在设置中配置 TTS 服务");
      return;
    }
    setLoading(true);
    synthesizer
      .getVoiceList()
      .then(list => setVoices(list as VoiceOption[]))
      .catch(() => toast.error("加载音色列表失败"))
      .finally(() => setLoading(false));
  }, [enabled]);
  const addVoice = useCallback((id: string, name?: string) => {
    setVoices(prev => [
      { id, name: name || id, description: "自定义克隆音色", type: "cloned" },
      ...prev.filter(v => v.id !== id),
    ]);
  }, []);
  return { voices, loading, addVoice };
}

export interface GenerateDialogProps {
  kind: VLTaskKind;
  projectId: number;
  mainDbName: string;
  /** AI 编辑的目标 */
  note?: VLNote;
  onClose: () => void;
  /** 任务已启动（产物占位已建好） */
  onStarted: (result: { taskId: string; note?: VLNote; quizSetId?: number }) => void;
}

export function GenerateDialog({
  kind,
  projectId,
  mainDbName,
  note,
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
  const [podcastName, setPodcastName] = useState("");
  const [speakers, setSpeakers] = useState<PodcastSpeaker[]>(DEFAULT_SPEAKERS);
  const [duration, setDuration] = useState<[number, number]>([3, 5]);
  const [showClone, setShowClone] = useState(false);
  const [cloneItems, setCloneItems] = useState<CloneVoiceItem[]>([
    { id: String(Date.now()), voiceId: "", voiceIdError: "", audioFiles: [] },
  ]);
  const [cloneLoading, setCloneLoading] = useState(false);
  const podcastVoices = usePodcastVoices(kind === "podcast");

  // AI 编辑默认不带参考资料；生成默认全选（或「基于这份资料」预选的那一份）
  const selection = useVLResourceSelection(projectId, { defaultSelectAll: !isEdit });
  const { loadResources } = selection;
  useEffect(() => {
    void loadResources();
  }, [loadResources]);

  const app = GENERATE_APPS.find(a => a.key === kind);
  const Icon = isEdit
    ? NOTE_ICONS[kind === "ppt_edit" ? "ppt" : "report"]
    : (app?.icon ?? Sparkles);
  const title = isEdit ? "AI 编辑" : `生成${app?.label ?? ""}`;

  const blocker = useMemo(() => {
    if (!isEdit && selection.selectedResourceIds.length === 0) return "至少选择一份资料";
    if (isEdit && !userPrompt.trim()) return "写下要怎么改";
    if (kind === "podcast") {
      if (!podcastName.trim()) return "给这期播客起个名字";
      if (speakers.some(s => !s.voiceId)) return "为每位说话人选择音色";
    }
    return null;
  }, [isEdit, kind, selection.selectedResourceIds.length, userPrompt, podcastName, speakers]);

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
        podcast:
          kind === "podcast"
            ? {
                name: podcastName.trim(),
                speakers,
                durationMin: duration[0],
                durationMax: duration[1],
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
      subtitle={COPY[kind].subtitle}
      context={isEdit ? note?.title : undefined}
      width={kind === "ppt" || kind === "report" || kind === "podcast" ? 720 : 560}
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
          {kind === "podcast" && (
            <Field label="播客名称">
              <Input
                data-autofocus
                value={podcastName}
                onChange={e => setPodcastName(e.target.value)}
                placeholder="这一期叫什么"
                maxLength={100}
              />
            </Field>
          )}
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

          {kind === "podcast" && (
            <>
              <Field label="说话人">
                <SpeakerConfig
                  speakers={speakers}
                  setSpeakers={setSpeakers}
                  voices={podcastVoices.voices}
                  voicesLoading={podcastVoices.loading}
                  notify={notifyToast}
                />
                <VoiceClonePanel
                  showCloneForm={showClone}
                  setShowCloneForm={setShowClone}
                  cloneItems={cloneItems}
                  setCloneItems={setCloneItems}
                  cloneLoading={cloneLoading}
                  setCloneLoading={setCloneLoading}
                  voices={podcastVoices.voices}
                  addVoiceToList={podcastVoices.addVoice}
                  notify={notifyToast}
                />
              </Field>
              <Field label="时长（分钟）">
                <div className="flex items-center gap-2">
                  <NumberInput
                    wrapperClassName="w-24"
                    value={duration[0]}
                    onValueChange={v =>
                      setDuration(prev => normalizeDurationRange(v ?? 1, prev[1]))
                    }
                  />
                  <span className="text-tau-meta text-ink-3">到</span>
                  <NumberInput
                    wrapperClassName="w-24"
                    value={duration[1]}
                    onValueChange={v =>
                      setDuration(prev => normalizeDurationRange(prev[0], v ?? 1))
                    }
                  />
                </div>
              </Field>
            </>
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
