import { memo, useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { App } from "antd";
import { Mic, Sparkles, RefreshCw, Loader2, CheckCircle2 } from "lucide-react";
import { useMemoizedFn } from "ahooks";
import classNames from "classnames";

import CustomModal from "@/components/CustomModal";
import { usePodcastGeneration } from "@/hooks/usePodcastGeneration";
import useLLMConfig from "@/hooks/useLLMConfig";
import useVLResourceSelection from "@/hooks/useVLResourceSelection";
import useVLTools from "@/hooks/useVLTools";
import useSettingStore from "@/stores/useSettingStore";
import { createVLNote } from "@/commands/vibe-learning";
import { createContent } from "@/commands";
import { createPodcast } from "@/commands/podcast";
import { VLNote } from "@/types/vibe-learning";
import type { PodcastSpeaker } from "@/types/podcast";
import { SpeakerRole } from "@/types/podcast";
import { getContentLength, importFromMarkdown } from "@/utils";

import { GenerationConfigStep } from "../components";

// 复用 PodcastGenerationModal 中的组件
import {
  SectionTitle,
  TextInput,
  TextStrong,
  TextSecondary,
} from "@/components/PodcastGenerationModal/ui";
import { SpeakerConfig } from "@/components/PodcastGenerationModal/SpeakerConfig";
import { VoiceClonePanel } from "@/components/PodcastGenerationModal/VoiceClonePanel";
import { ProgressView } from "@/components/PodcastGenerationModal/ProgressView";
import { ResultPreview } from "@/components/PodcastGenerationModal/ResultPreview";
import { normalizeDurationRange } from "@/components/PodcastGenerationModal/utils";
import type {
  CloneVoiceItem,
  NoticeType,
  VoiceOption,
} from "@/components/PodcastGenerationModal/types";

interface PodcastGenerateModalProps {
  open: boolean;
  projectId: number;
  mainDbName: string;
  onClose: () => void;
  onNoteCreated?: (note: VLNote) => void;
}

type Step = "select-resources" | "generating" | "preview";

const PodcastGenerateModal = memo((props: PodcastGenerateModalProps) => {
  const { open, projectId, mainDbName, onClose, onNoteCreated } = props;
  const { message } = App.useApp();

  // LLM 配置
  const { providerConfig, modelConfig } = useLLMConfig("podcastGeneration");

  // 资源选择
  const {
    resources,
    selectedResourceIds,
    loading: loadingResources,
    isAllSelected,
    loadResources,
    toggleResource,
    toggleAll,
    getSelectedResourceNames,
    reset: resetResources,
  } = useVLResourceSelection(projectId);

  // 注册 VibeLearning 专属工具
  useVLTools({
    projectId,
    mainDbName,
    sourceId: `podcast-generation-${projectId}`,
    enabled: open,
  });

  // 播客生成
  const {
    status,
    stage,
    stageProgress,
    ttsTotal,
    ttsCompleted,
    logs,
    script,
    scriptLines,
    segmentAudios,
    error,
    audioUrl,
    duration,
    voices,
    voicesLoading,
    loadVoices,
    addVoiceToList,
    generatePodcast,
    continueWithTTS,
    regenerateSegment,
    reset: resetPodcast,
  } = usePodcastGeneration();

  // 本地状态
  const [step, setStep] = useState<Step>("select-resources");
  const [userPrompt, setUserPrompt] = useState("");
  const [podcastName, setPodcastName] = useState("");
  const [speakers, setSpeakers] = useState<PodcastSpeaker[]>([
    { name: "主持人", voiceId: "", voiceName: "", role: SpeakerRole.Host },
    { name: "嘉宾", voiceId: "", voiceName: "", role: SpeakerRole.Guest },
  ]);
  const [durationRange, setDurationRange] = useState<[number, number]>([3, 5]);
  const [saving, setSaving] = useState(false);

  // 音色克隆相关状态
  const [showCloneForm, setShowCloneForm] = useState(false);
  const [cloneItems, setCloneItems] = useState<CloneVoiceItem[]>([
    {
      id: Date.now().toString(),
      voiceId: "",
      voiceIdError: "",
      audioFiles: [],
    },
  ]);
  const [cloneLoading, setCloneLoading] = useState(false);

  const minimaxApiKey = useSettingStore(
    (state) => state.setting.integration.minimax.apiKey,
  );

  // 通知系统
  const [notices, setNotices] = useState<
    Array<{ id: number; type: NoticeType; text: string }>
  >([]);
  const notify = useCallback((type: NoticeType, text: string) => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setNotices((prev) => [...prev, { id, type, text }]);
    const timeout = type === "error" ? 4000 : 2500;
    window.setTimeout(() => {
      setNotices((prev) => prev.filter((n) => n.id !== id));
    }, timeout);
  }, []);

  // 用于跟踪是否需要自动继续 TTS
  const shouldAutoContinueRef = useRef(false);

  // 重置状态
  const resetState = useMemoizedFn(() => {
    setStep("select-resources");
    setUserPrompt("");
    setPodcastName("");
    setSpeakers([
      { name: "主持人", voiceId: "", voiceName: "", role: SpeakerRole.Host },
      { name: "嘉宾", voiceId: "", voiceName: "", role: SpeakerRole.Guest },
    ]);
    setDurationRange([3, 5]);
    setSaving(false);
    setShowCloneForm(false);
    setCloneItems([
      {
        id: Date.now().toString(),
        voiceId: "",
        voiceIdError: "",
        audioFiles: [],
      },
    ]);
    resetResources();
    resetPodcast();
    shouldAutoContinueRef.current = false;
  });

  // 打开弹窗时加载资源和音色
  useEffect(() => {
    if (open) {
      resetState();
      loadResources();
      if (voices.length === 0) {
        loadVoices();
      }
    }
  }, [open, loadResources, loadVoices, resetState, voices.length]);

  // 监听脚本生成完成，自动继续 TTS（核心差异点：不等待用户确认）
  useEffect(() => {
    if (
      shouldAutoContinueRef.current &&
      status === "loading" &&
      stage === "script" &&
      scriptLines.length > 0
    ) {
      // 脚本生成完成，自动继续 TTS
      shouldAutoContinueRef.current = false;
      continueWithTTS(scriptLines, false);
    }
  }, [status, stage, scriptLines, continueWithTTS]);

  // 监听生成完成
  useEffect(() => {
    if (status === "complete" && audioUrl) {
      setStep("preview");
    } else if (status === "error") {
      // 如果有部分结果，显示预览；否则返回配置
      if (audioUrl) {
        setStep("preview");
      } else {
        setStep("select-resources");
      }
    }
  }, [status, audioUrl]);

  // 开始生成播客
  const handleStartGenerate = useMemoizedFn(async () => {
    if (selectedResourceIds.length === 0) {
      message.error("请选择至少一个资源");
      return;
    }

    if (!podcastName.trim()) {
      message.error("请输入播客名称");
      return;
    }

    if (speakers.some((s) => !s.voiceId)) {
      message.error("请为所有说话人选择音色");
      return;
    }

    if (!providerConfig || !modelConfig) {
      message.error("请先在设置中配置播客生成的 AI 模型");
      return;
    }

    setStep("generating");

    const resourceNames = getSelectedResourceNames();

    // 设置自动继续标志
    shouldAutoContinueRef.current = true;

    try {
      // 开始生成（脚本生成完成后会自动继续 TTS）
      await generatePodcast({
        resourceNames,
        userPrompt: userPrompt || undefined,
        enableTools: true,
        speakers,
        generateMusic: false,
        durationMin: durationRange[0],
        durationMax: durationRange[1],
      });
    } catch (error) {
      console.error("播客生成失败:", error);
      shouldAutoContinueRef.current = false;
      setStep("select-resources");
    }
  });

  // 重新生成
  const handleRegenerate = useMemoizedFn(() => {
    setStep("select-resources");
    resetPodcast();
    shouldAutoContinueRef.current = false;
  });

  // 保存为笔记
  const handleSave = useMemoizedFn(async () => {
    if (!audioUrl) {
      message.error("没有可保存的播客");
      return;
    }

    setSaving(true);

    try {
      // 1. 创建播客记录
      const podcast = await createPodcast({
        name: podcastName.trim() || "播客",
        audioUrl,
        script,
        scriptLines,
        duration,
        speakers,
      });

      // 2. 创建笔记内容（保存脚本作为文本内容）
      const scriptText = scriptLines
        .map((line) => `**${line.speaker}**: ${line.text}`)
        .join("\n\n");
      const markdownContent = `# ${podcastName.trim() || "播客"}\n\n${scriptText}`;
      const noteContent = importFromMarkdown(markdownContent);
      const count = getContentLength(noteContent);
      const newContentId = await createContent(noteContent, count);

      if (!newContentId) {
        throw new Error("创建内容失败");
      }

      // 3. 创建 VLNote 并关联 podcast
      const note = await createVLNote({
        projectId,
        contentId: newContentId,
        title: podcastName.trim() || "播客",
        type: "podcast",
        podcastId: podcast.id,
      });

      message.success("播客已保存为笔记");

      // 回调通知创建了笔记
      onNoteCreated?.(note);

      onClose();
    } catch (e) {
      console.error("保存播客失败:", e);
      message.error((e as Error).message || "保存失败");
    } finally {
      setSaving(false);
    }
  });

  // 关闭弹窗
  const handleClose = useMemoizedFn(() => {
    onClose();
  });

  // 获取当前进度描述
  const getProgressText = useMemoizedFn(() => {
    if (stage === "parsing") return "正在解析资料...";
    if (stage === "script") return "正在生成播客脚本...";
    if (stage === "tts") return `正在合成语音 (${ttsCompleted}/${ttsTotal})`;
    if (stage === "merging") return "正在合并音频...";
    if (stage === "upload") return "正在上传音频...";
    return "处理中...";
  });

  // 渲染资源选择步骤
  const renderResourceSelect = () => (
    <div className="space-y-6">
      {/* 通知显示 */}
      {notices.length > 0 && (
        <div className="space-y-2">
          {notices.map((notice) => (
            <div
              key={notice.id}
              className={classNames(
                "px-3 py-2 rounded-lg text-sm border whitespace-pre-wrap",
                notice.type === "success" &&
                  "bg-green-50 border-green-200 text-green-700 dark:bg-green-500/10 dark:border-green-500/30 dark:text-green-400",
                notice.type === "error" &&
                  "bg-red-50 border-red-200 text-red-700 dark:bg-red-500/10 dark:border-red-500/30 dark:text-red-400",
                notice.type === "warning" &&
                  "bg-yellow-50 border-yellow-200 text-yellow-700 dark:bg-yellow-500/10 dark:border-yellow-500/30 dark:text-yellow-400",
                notice.type === "info" &&
                  "bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-500/10 dark:border-blue-500/30 dark:text-blue-400",
              )}
            >
              {notice.text}
            </div>
          ))}
        </div>
      )}

      {/* 播客名称 */}
      <div>
        <SectionTitle className="mb-2">播客名称</SectionTitle>
        <TextInput
          placeholder="请输入播客名称"
          value={podcastName}
          onChange={setPodcastName}
          maxLength={100}
        />
        <div className="mt-1 text-right text-xs text-gray-400 dark:text-slate-500">
          {podcastName.length}/100
        </div>
      </div>

      {/* 资源选择和额外提示 */}
      <GenerationConfigStep
        resources={resources}
        selectedResourceIds={selectedResourceIds}
        loading={loadingResources}
        isAllSelected={isAllSelected}
        onToggleResource={toggleResource}
        onToggleAll={toggleAll}
        userPrompt={userPrompt}
        onUserPromptChange={setUserPrompt}
        promptPlaceholder="例如：重点讨论 XXX 概念，风格轻松幽默..."
        promptTitle="额外要求（可选）"
        resourceTitle="选择资源"
        emptyResourceText="暂无可用资源"
      />

      {/* 说话人配置 */}
      <div>
        <SectionTitle className="mb-3">说话人配置</SectionTitle>
        <SpeakerConfig
          speakers={speakers}
          setSpeakers={setSpeakers}
          voices={voices as VoiceOption[]}
          voicesLoading={voicesLoading}
          notify={notify}
        />

        <VoiceClonePanel
          showCloneForm={showCloneForm}
          setShowCloneForm={setShowCloneForm}
          cloneItems={cloneItems}
          setCloneItems={setCloneItems}
          cloneLoading={cloneLoading}
          setCloneLoading={setCloneLoading}
          minimaxApiKey={minimaxApiKey}
          voices={voices as VoiceOption[]}
          addVoiceToList={addVoiceToList}
          notify={notify}
        />
      </div>

      {/* 时长设置 */}
      <div>
        <SectionTitle className="mb-2">播客时长（分钟）</SectionTitle>
        <div className="flex items-center gap-2">
          <TextInput
            type="number"
            value={String(durationRange[0])}
            onChange={(value) => {
              const nextMin = Number(value);
              setDurationRange((prev) =>
                normalizeDurationRange(nextMin, prev[1]),
              );
            }}
            className="w-20"
          />
          <TextSecondary>到</TextSecondary>
          <TextInput
            type="number"
            value={String(durationRange[1])}
            onChange={(value) => {
              const nextMax = Number(value);
              setDurationRange((prev) =>
                normalizeDurationRange(prev[0], nextMax),
              );
            }}
            className="w-20"
          />
        </div>
        <TextSecondary className="text-xs mt-1 block">
          当前: {durationRange[0]} - {durationRange[1]} 分钟
        </TextSecondary>
      </div>
    </div>
  );

  // 渲染生成中步骤
  const renderGenerating = () => (
    <div className="space-y-4">
      <ProgressView
        stage={stage}
        stageProgress={stageProgress}
        ttsCompleted={ttsCompleted}
        ttsTotal={ttsTotal}
        logs={logs}
      />
      <TextSecondary className="text-sm text-center block">
        {getProgressText()}
      </TextSecondary>
    </div>
  );

  // 渲染预览步骤
  const renderPreview = () => (
    <div className="space-y-4">
      {/* 播客名称编辑 */}
      <div>
        <TextStrong className="block mb-2">播客名称</TextStrong>
        <TextInput
          placeholder="请输入播客名称"
          value={podcastName}
          onChange={setPodcastName}
          maxLength={100}
        />
      </div>

      {/* 结果预览 */}
      {audioUrl && (
        <ResultPreview
          audioUrl={audioUrl}
          duration={duration}
          scriptLines={scriptLines}
          segmentAudios={segmentAudios}
          regenerateSegment={regenerateSegment}
          notify={notify}
        />
      )}

      {/* 错误显示 */}
      {error && (
        <div className="p-3 rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 text-sm text-red-700 dark:text-red-400 whitespace-pre-wrap">
          {error}
        </div>
      )}
    </div>
  );

  // 按钮样式
  const primaryButtonClass = classNames(
    "px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200",
    "bg-blue-500 text-white",
    "hover:bg-blue-600",
    "disabled:bg-gray-200 dark:disabled:bg-zinc-800 disabled:text-gray-400 disabled:cursor-not-allowed",
  );

  const secondaryButtonClass = classNames(
    "px-5 py-2.5 rounded-xl text-sm font-medium transition-all",
    "bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-gray-300",
    "hover:bg-gray-200 dark:hover:bg-zinc-700",
    "border border-gray-200 dark:border-gray-700",
  );

  // 渲染底部按钮
  const renderFooter = () => {
    if (step === "generating") {
      return null;
    }

    if (step === "select-resources") {
      return (
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={handleClose}
            className={secondaryButtonClass}
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleStartGenerate}
            disabled={
              selectedResourceIds.length === 0 ||
              !podcastName.trim() ||
              speakers.some((s) => !s.voiceId)
            }
            className={classNames(
              primaryButtonClass,
              "flex items-center gap-2",
            )}
          >
            <Sparkles className="w-4 h-4" />
            生成播客
          </button>
        </div>
      );
    }

    // preview step
    return (
      <div className="flex justify-between">
        <button
          type="button"
          onClick={handleRegenerate}
          className={classNames(
            secondaryButtonClass,
            "flex items-center gap-2",
          )}
        >
          <RefreshCw className="w-4 h-4" />
          重新生成
        </button>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={handleClose}
            className={secondaryButtonClass}
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!audioUrl || saving}
            className={classNames(
              primaryButtonClass,
              "flex items-center gap-2",
            )}
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <CheckCircle2 className="w-4 h-4" />
            )}
            保存为笔记
          </button>
        </div>
      </div>
    );
  };

  // 根据步骤获取标题
  const getModalTitle = () => {
    switch (step) {
      case "select-resources":
        return "生成播客";
      case "generating":
        return "生成中";
      case "preview":
        return "预览播客";
      default:
        return "生成播客";
    }
  };

  // 根据步骤获取副标题
  const getModalSubtitle = () => {
    switch (step) {
      case "select-resources":
        return "选择资源，配置说话人和音色，AI 将自动生成对话播客";
      case "generating":
        return "AI 正在根据资料生成播客...";
      case "preview":
        return "检查生成的播客，可保存为笔记";
      default:
        return "";
    }
  };

  return (
    <CustomModal
      open={open}
      onCancel={handleClose}
      width={800}
      centered
      destroyOnClose
      title={getModalTitle()}
      subtitle={getModalSubtitle()}
      icon={<Mic className="w-5 h-5 text-purple-500" />}
      iconBgColor="bg-purple-50 dark:bg-purple-500/20 border-purple-200 dark:border-purple-500/30"
      footer={renderFooter()}
      showCloseButton={step !== "generating"}
      bodyClassName="overflow-y-auto pt-3"
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.2 }}
        >
          {step === "select-resources" && renderResourceSelect()}
          {step === "generating" && renderGenerating()}
          {step === "preview" && renderPreview()}
        </motion.div>
      </AnimatePresence>
    </CustomModal>
  );
});

PodcastGenerateModal.displayName = "PodcastGenerateModal";

export default PodcastGenerateModal;
