import { useState, useEffect, useCallback, memo, useRef } from "react";
import classNames from "classnames";
import CustomModal from "@/components/CustomModal";
import {
  Button,
  SectionTitle,
  TextInput,
  TextStrong,
  TextSecondary,
} from "./ui";
import { usePodcastGeneration } from "@/hooks/usePodcastGeneration";
import type { PodcastSpeaker, IPodcast } from "@/types/podcast";
import { SpeakerRole } from "@/types/podcast";
import type { Descendant } from "slate";
import { getMarkdown } from "@/utils/markdown";
import useSettingStore from "@/stores/useSettingStore";
import type { PodcastScriptLine } from "@/types/minimax";
import type { CloneVoiceItem, NoticeType, VoiceOption } from "./types";
import { normalizeDurationRange } from "./utils";
import { ScriptEditor } from "./ScriptEditor";
import { SpeakerConfig } from "./SpeakerConfig";
import { VoiceClonePanel } from "./VoiceClonePanel";
import { ProgressView } from "./ProgressView";
import { ResultPreview } from "./ResultPreview";

interface PodcastGenerationModalProps {
  open: boolean;
  cardContent: Descendant[];
  onSuccess: (
    audioUrl: string,
    script: string,
    scriptLines: PodcastScriptLine[],
    duration: number,
    speakers: PodcastSpeaker[],
    name?: string,
  ) => void;
  onCancel: () => void;
  initialPodcast?: IPodcast;
  saveText?: string;
}

const PodcastGenerationModal = memo<PodcastGenerationModalProps>(
  ({ open, cardContent, onSuccess, onCancel, initialPodcast, saveText }) => {
    const [podcastName, setPodcastName] = useState<string>("");
    const [speakers, setSpeakers] = useState<PodcastSpeaker[]>([
      { name: "Speaker1", voiceId: "", voiceName: "", role: SpeakerRole.Host },
      { name: "Speaker2", voiceId: "", voiceName: "", role: SpeakerRole.Guest },
    ]);
    const [generateMusic, setGenerateMusic] = useState(false);
    const [durationRange, setDurationRange] = useState<[number, number]>([
      3, 5,
    ]);

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

    // 音频播放状态（用于关闭时清理）
    const currentAudioRef = useRef<HTMLAudioElement | null>(null);

    const minimaxApiKey = useSettingStore(
      (state) => state.setting.integration.minimax.apiKey,
    );

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
      updateScriptLines,
      regenerateSegment,
      reset,
      setInitialState,
    } = usePodcastGeneration();

    // 加载音色列表
    useEffect(() => {
      if (open && voices.length === 0) {
        loadVoices();
      }
    }, [open, voices.length, loadVoices]);

    // 初始化编辑状态
    useEffect(() => {
      if (open && initialPodcast) {
        setPodcastName(initialPodcast.name || "");
        setSpeakers(initialPodcast.speakers);

        setInitialState({
          status: "complete",
          audioUrl: initialPodcast.audioUrl,
          script: initialPodcast.script,
          scriptLines: initialPodcast.scriptLines || [],
          duration: initialPodcast.duration,
          segmentAudios: [],
        });
      }
    }, [open, initialPodcast, setInitialState]);

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

    const handleGenerate = useCallback(async () => {
      if (speakers.some((s) => !s.voiceId)) {
        notify("error", "请为所有说话人选择音色");
        return;
      }

      if (!podcastName.trim()) {
        notify("error", "请输入播客名称");
        return;
      }

      const content = getMarkdown(cardContent);
      if (!content || content.trim().length === 0) {
        notify("error", "卡片内容为空");
        return;
      }

      await generatePodcast({
        content,
        speakers,
        generateMusic,
        durationMin: durationRange[0],
        durationMax: durationRange[1],
      });
    }, [
      speakers,
      notify,
      generateMusic,
      durationRange,
      cardContent,
      generatePodcast,
      podcastName,
    ]);

    const handleClose = useCallback(() => {
      if (currentAudioRef.current) {
        currentAudioRef.current.pause();
        currentAudioRef.current = null;
      }

      reset();
      setPodcastName("");
      setSpeakers([
        {
          name: "Speaker1",
          voiceId: "",
          voiceName: "",
          role: SpeakerRole.Host,
        },
        {
          name: "Speaker2",
          voiceId: "",
          voiceName: "",
          role: SpeakerRole.Guest,
        },
      ]);
      setGenerateMusic(false);
      setDurationRange([3, 5]);
      setShowCloneForm(false);
      setCloneItems([
        {
          id: Date.now().toString(),
          voiceId: "",
          voiceIdError: "",
          audioFiles: [],
        },
      ]);
      onCancel();
    }, [reset, onCancel]);

    const handleSuccess = useCallback(() => {
      if (audioUrl) {
        onSuccess(
          audioUrl,
          script,
          scriptLines,
          duration,
          speakers,
          podcastName.trim() || undefined,
        );
        handleClose();
      }
    }, [
      audioUrl,
      script,
      scriptLines,
      duration,
      speakers,
      onSuccess,
      podcastName,
      handleClose,
    ]);

    const footerNode =
      status === "complete" ? (
        <div className="flex gap-3 justify-end">
          <Button onClick={handleClose}>关闭</Button>
          <Button variant="primary" onClick={handleSuccess}>
            {saveText ?? "保存到卡片"}
          </Button>
        </div>
      ) : status === "loading" && stage === "script" && scriptLines.length > 0 ? (
        <div className="flex gap-3 justify-end">
          <Button onClick={() => reset()}>取消</Button>
          <Button
            variant="primary"
            onClick={() => continueWithTTS(scriptLines, generateMusic)}
          >
            确认并生成音频
          </Button>
        </div>
      ) : status === "loading" ? null : (
        <div className="flex gap-3 justify-end">
          <Button onClick={handleClose}>取消</Button>
          <Button
            variant="primary"
            onClick={handleGenerate}
            disabled={speakers.some((s) => !s.voiceId) || !podcastName.trim()}
          >
            开始生成
          </Button>
        </div>
      );

    return (
      <CustomModal
        title="生成播客"
        open={open}
        onCancel={handleClose}
        width={800}
        footer={footerNode}
        maskClosable={false}
        closeOnEscape={status !== "loading"}
        bodyScrollable={true}
        bodyClassName="pt-3"
      >
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

          {/* 初始配置阶段 */}
          {status === "idle" && (
            <div className="space-y-4">
              <SectionTitle>基础信息</SectionTitle>
              <div>
                <TextStrong className="block mb-2">播客名称</TextStrong>
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

              <SectionTitle>说话人配置</SectionTitle>
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
          )}

          {/* 其他选项 */}
          {status === "idle" && (
            <div className="space-y-4">
              <SectionTitle>其他选项</SectionTitle>

              <div className="flex items-start gap-4">
                <TextSecondary className="whitespace-nowrap pt-2">
                  播客时长（分钟）
                </TextSecondary>
                <div className="flex-1 flex items-center gap-2">
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
              </div>

              <TextSecondary className="text-xs">
                当前: {durationRange[0]} - {durationRange[1]} 分钟
              </TextSecondary>
            </div>
          )}

          {/* 脚本编辑阶段 */}
          {status === "loading" &&
            stage === "script" &&
            scriptLines.length > 0 && (
              <ScriptEditor
                scriptLines={scriptLines}
                speakers={speakers}
                updateScriptLines={updateScriptLines}
              />
            )}

          {/* 进度显示 (非脚本编辑阶段) */}
          {status === "loading" &&
            (stage !== "script" || scriptLines.length === 0) && (
              <ProgressView
                stage={stage}
                stageProgress={stageProgress}
                ttsCompleted={ttsCompleted}
                ttsTotal={ttsTotal}
                logs={logs}
              />
            )}

          {/* 结果预览 */}
          {status === "complete" && audioUrl && (
            <div className="space-y-4">
              <div>
                <TextStrong className="block mb-2">播客名称</TextStrong>
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

              {/* 说话人配置 */}
              <SectionTitle>说话人配置</SectionTitle>
              <SpeakerConfig
                speakers={speakers}
                setSpeakers={setSpeakers}
                voices={voices as VoiceOption[]}
                voicesLoading={voicesLoading}
                notify={notify}
              />

              <ResultPreview
                audioUrl={audioUrl}
                duration={duration}
                scriptLines={scriptLines}
                segmentAudios={segmentAudios}
                regenerateSegment={regenerateSegment}
                notify={notify}
              />
            </div>
          )}

          {/* 错误显示 */}
          {status === "error" && (
            <div className="space-y-4">
              <SectionTitle>生成失败</SectionTitle>
              {error && (
                <div className="p-3 rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 text-sm text-red-700 dark:text-red-400 whitespace-pre-wrap">
                  {error}
                </div>
              )}
              <TextSecondary className="text-sm text-red-700 dark:text-red-400">
                请查看日志了解详情
              </TextSecondary>
              <details open className="mt-4">
                <summary className="cursor-pointer text-sm font-medium text-gray-700 dark:text-slate-200 flex items-center justify-between">
                  详细日志
                </summary>
                <div className="mt-2 max-h-64 overflow-y-auto space-y-1 p-2 rounded">
                  {logs.map((log, index) => (
                    <div
                      key={index}
                      className="text-sm text-gray-700 dark:text-slate-200"
                    >
                      {log}
                    </div>
                  ))}
                </div>
              </details>
            </div>
          )}
        </div>
      </CustomModal>
    );
  },
);

export default PodcastGenerationModal;
