import { useState, useEffect, useCallback, memo, useRef } from "react";
import { Dialog, toast } from "@tau/ui";
import { Button, SectionTitle, TextInput, TextStrong, TextSecondary } from "./ui";
import { usePodcastGeneration } from "@/hooks/usePodcastGeneration";
import type { PodcastSpeaker, IPodcast, PodcastScriptLine } from "@/types/podcast";
import { SpeakerRole } from "@/types/podcast";
import type { Descendant } from "slate";
import { getMarkdown } from "@/utils/markdown";
import useSettingStore from "@/stores/useSettingStore";
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
    name?: string
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
    const [durationRange, setDurationRange] = useState<[number, number]>([3, 5]);

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

    const minimaxApiKey = useSettingStore(state => state.setting.integration.minimax.apiKey);

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

    // 通知走全局 toast（type 与 toast 方法名一一对应）
    const notify = useCallback((type: NoticeType, text: string) => {
      toast[type](text);
    }, []);

    const handleGenerate = useCallback(async () => {
      if (speakers.some(s => !s.voiceId)) {
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

      const error = await generatePodcast({
        content,
        speakers,
        generateMusic,
        durationMin: durationRange[0],
        durationMax: durationRange[1],
      });
      if (error) {
        notify("error", error);
      }
    }, [speakers, notify, generateMusic, durationRange, cardContent, generatePodcast, podcastName]);

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
          podcastName.trim() || undefined
        );
        handleClose();
      }
    }, [audioUrl, script, scriptLines, duration, speakers, onSuccess, podcastName, handleClose]);

    const footerNode =
      status === "complete" ? (
        <div className="flex justify-end gap-3">
          <Button onClick={handleClose}>关闭</Button>
          <Button variant="primary" onClick={handleSuccess}>
            {saveText ?? "保存到卡片"}
          </Button>
        </div>
      ) : status === "loading" && stage === "script" && scriptLines.length > 0 ? (
        <div className="flex justify-end gap-3">
          <Button onClick={() => reset()}>取消</Button>
          <Button
            variant="primary"
            onClick={async () => {
              const error = await continueWithTTS(scriptLines, generateMusic);
              if (error) {
                notify("error", error);
              }
            }}
          >
            确认并生成音频
          </Button>
        </div>
      ) : status === "loading" ? null : (
        <div className="flex justify-end gap-3">
          <Button onClick={handleClose}>取消</Button>
          <Button
            variant="primary"
            onClick={handleGenerate}
            disabled={speakers.some(s => !s.voiceId) || !podcastName.trim()}
          >
            开始生成
          </Button>
        </div>
      );

    return (
      <Dialog
        title="生成播客"
        open={open}
        onOpenChange={next => {
          if (!next) handleClose();
        }}
        width={800}
        locked={status === "loading"}
        footer={footerNode}
      >
        <div className="space-y-6">
          {/* 初始配置阶段 */}
          {status === "idle" && (
            <div className="space-y-4">
              <SectionTitle>基础信息</SectionTitle>
              <div>
                <TextStrong className="mb-2 block">播客名称</TextStrong>
                <TextInput
                  placeholder="请输入播客名称"
                  value={podcastName}
                  onChange={setPodcastName}
                  maxLength={100}
                />
                <div className="text-ink-3 text-tau-sm mt-1 text-right tabular-nums">
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

              <div className="flex items-center gap-3">
                <TextSecondary className="whitespace-nowrap text-sm">播客时长</TextSecondary>
                <div className="flex items-center gap-2">
                  <TextInput
                    type="number"
                    value={String(durationRange[0])}
                    onChange={value => {
                      const nextMin = Number(value);
                      setDurationRange(prev => normalizeDurationRange(nextMin, prev[1]));
                    }}
                    className="w-16"
                  />
                  <TextSecondary className="text-xs">~</TextSecondary>
                  <TextInput
                    type="number"
                    value={String(durationRange[1])}
                    onChange={value => {
                      const nextMax = Number(value);
                      setDurationRange(prev => normalizeDurationRange(prev[0], nextMax));
                    }}
                    className="w-16"
                  />
                  <TextSecondary className="text-xs">分钟</TextSecondary>
                </div>
              </div>
            </div>
          )}

          {/* 脚本编辑阶段 */}
          {status === "loading" && stage === "script" && scriptLines.length > 0 && (
            <ScriptEditor
              scriptLines={scriptLines}
              speakers={speakers}
              updateScriptLines={updateScriptLines}
            />
          )}

          {/* 进度显示 (非脚本编辑阶段) */}
          {status === "loading" && (stage !== "script" || scriptLines.length === 0) && (
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
                <TextStrong className="mb-2 block">播客名称</TextStrong>
                <TextInput
                  placeholder="请输入播客名称"
                  value={podcastName}
                  onChange={setPodcastName}
                  maxLength={100}
                />
                <div className="text-ink-3 text-tau-sm mt-1 text-right tabular-nums">
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
                <div className="bg-danger-soft text-danger rounded-tau-md text-tau-body whitespace-pre-wrap p-3">
                  {error}
                </div>
              )}
              <details open className="mt-4">
                <summary className="text-ink-3 text-tau-sm cursor-pointer select-none font-medium">
                  详细日志
                </summary>
                <div className="border-line-1 rounded-tau-md mt-2 max-h-64 space-y-0.5 overflow-y-auto border p-3">
                  {logs.map((log, index) => (
                    <div
                      key={index}
                      className="text-ink-2 font-tau-mono text-tau-sm leading-relaxed"
                    >
                      {log}
                    </div>
                  ))}
                </div>
              </details>
            </div>
          )}
        </div>
      </Dialog>
    );
  }
);

export default PodcastGenerationModal;
