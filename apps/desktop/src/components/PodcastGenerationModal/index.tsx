import { useState, useEffect, useCallback, memo, useRef } from "react";
import { AudioLines, Mic, Save, Sparkles } from "lucide-react";
import { Button, Dialog, DialogBody, Input, NumberInput, toast } from "@tau/ui";
import { Field, LogPanel } from "./ui";
import { usePodcastGeneration } from "@/hooks/usePodcastGeneration";
import type { PodcastSpeaker, IPodcast, PodcastScriptLine } from "@/types/podcast";
import { SpeakerRole } from "@/types/podcast";
import type { Descendant } from "slate";
import { getMarkdown } from "@/utils/markdown";
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
        audioFile: null,
      },
    ]);
    const [cloneLoading, setCloneLoading] = useState(false);

    // 音频播放状态（用于关闭时清理）
    const currentAudioRef = useRef<HTMLAudioElement | null>(null);

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
          audioFile: null,
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

    const isEditingScript = status === "loading" && stage === "script" && scriptLines.length > 0;

    const blocker =
      status === "idle" || status === "error"
        ? speakers.some(s => !s.voiceId)
          ? "为每位说话人选择音色"
          : !podcastName.trim()
            ? "给这期播客起个名字"
            : null
        : null;

    const subtitle =
      status === "complete"
        ? "试听结果，单段可以改稿后重新合成"
        : isEditingScript
          ? "检查并调整脚本，确认后开始合成语音"
          : status === "loading"
            ? "正在生成，请稍候"
            : status === "error"
              ? "生成没有完成，可以查看日志后重试"
              : "把当前内容改写成一期多人对话播客";

    const impact = isEditingScript
      ? `共 ${scriptLines.length} 段对话，可拖动调整顺序`
      : status === "loading"
        ? "生成过程中无法关闭"
        : (blocker ?? undefined);

    const footerNode =
      status === "complete" ? (
        <>
          <Button variant="secondary" size="sm" onClick={handleClose}>
            关闭
          </Button>
          <Button variant="primary" size="sm" icon={Save} onClick={handleSuccess}>
            {saveText ?? "保存到卡片"}
          </Button>
        </>
      ) : isEditingScript ? (
        <>
          <Button variant="secondary" size="sm" onClick={() => reset()}>
            取消
          </Button>
          <Button
            variant="primary"
            size="sm"
            icon={AudioLines}
            onClick={async () => {
              const error = await continueWithTTS(scriptLines, generateMusic);
              if (error) {
                notify("error", error);
              }
            }}
          >
            确认并生成音频
          </Button>
        </>
      ) : status === "loading" ? null : (
        <>
          <Button variant="secondary" size="sm" onClick={handleClose}>
            取消
          </Button>
          <Button
            variant="primary"
            size="sm"
            icon={Sparkles}
            onClick={handleGenerate}
            disabled={!!blocker}
          >
            开始生成
          </Button>
        </>
      );

    const nameField = (
      <Field label="播客名称" hint={`${podcastName.length}/100`}>
        <Input
          data-autofocus
          placeholder="这一期叫什么"
          value={podcastName}
          onChange={e => setPodcastName(e.target.value)}
          maxLength={100}
        />
      </Field>
    );

    const speakerField = (
      <Field label="说话人">
        <SpeakerConfig
          speakers={speakers}
          setSpeakers={setSpeakers}
          voices={voices as VoiceOption[]}
          voicesLoading={voicesLoading}
          notify={notify}
        />
      </Field>
    );

    return (
      <Dialog
        title="生成播客"
        icon={<Mic className="size-4" strokeWidth={1.75} />}
        subtitle={subtitle}
        open={open}
        onOpenChange={next => {
          if (!next) handleClose();
        }}
        width={720}
        locked={status === "loading"}
        impact={impact}
        footer={footerNode}
      >
        <DialogBody>
          <div className="flex flex-col gap-5 pt-2">
            {/* 初始配置阶段 */}
            {status === "idle" && (
              <>
                {nameField}
                <div className="flex flex-col gap-2">
                  {speakerField}
                  <VoiceClonePanel
                    showCloneForm={showCloneForm}
                    setShowCloneForm={setShowCloneForm}
                    cloneItems={cloneItems}
                    setCloneItems={setCloneItems}
                    cloneLoading={cloneLoading}
                    setCloneLoading={setCloneLoading}
                    voices={voices as VoiceOption[]}
                    addVoiceToList={addVoiceToList}
                    notify={notify}
                  />
                </div>
                <Field label="时长（分钟）">
                  <div className="flex items-center gap-2">
                    <NumberInput
                      aria-label="最短时长"
                      wrapperClassName="w-24"
                      value={durationRange[0]}
                      onValueChange={v =>
                        setDurationRange(prev => normalizeDurationRange(v ?? 1, prev[1]))
                      }
                    />
                    <span className="text-tau-meta text-ink-3">到</span>
                    <NumberInput
                      aria-label="最长时长"
                      wrapperClassName="w-24"
                      value={durationRange[1]}
                      onValueChange={v =>
                        setDurationRange(prev => normalizeDurationRange(prev[0], v ?? 1))
                      }
                    />
                  </div>
                </Field>
              </>
            )}

            {/* 脚本编辑阶段 */}
            {isEditingScript && (
              <ScriptEditor
                scriptLines={scriptLines}
                speakers={speakers}
                updateScriptLines={updateScriptLines}
              />
            )}

            {/* 进度显示 (非脚本编辑阶段) */}
            {status === "loading" && !isEditingScript && (
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
              <>
                {nameField}
                {speakerField}
                <ResultPreview
                  audioUrl={audioUrl}
                  duration={duration}
                  scriptLines={scriptLines}
                  segmentAudios={segmentAudios}
                  regenerateSegment={regenerateSegment}
                  notify={notify}
                />
              </>
            )}

            {/* 错误显示 */}
            {status === "error" && (
              <>
                {error && (
                  <div className="bg-danger-soft text-danger rounded-tau-sm text-tau-body whitespace-pre-wrap px-3 py-2">
                    {error}
                  </div>
                )}
                <LogPanel logs={logs} />
              </>
            )}
          </div>
        </DialogBody>
      </Dialog>
    );
  }
);

export default PodcastGenerationModal;
