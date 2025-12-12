import { useState, useEffect, useCallback, memo, useRef } from "react";
import classNames from "classnames";
import {
  Plus,
  Trash2,
  Volume2,
  FileText,
  Upload,
  ChevronUp,
  ChevronDown,
  RefreshCw,
  Pause,
} from "lucide-react";
import CustomModal from "@/components/CustomModal";
import {
  Button,
  SectionTitle,
  SelectField,
  TextArea,
  TextInput,
  TextSecondary,
  TextStrong,
} from "./ui";
import { usePodcastGeneration } from "@/hooks/usePodcastGeneration";
import type { PodcastSpeaker, IPodcast } from "@/types/podcast";
import { SpeakerRole } from "@/types/podcast";
import type { Descendant } from "slate";
import { getMarkdown } from "@/utils/markdown";
import { uploadReferenceAudio, cloneVoice } from "@/services/minimax";
import useSettingStore from "@/stores/useSettingStore";
import { extractPodcastSegment } from "@/commands/podcast-audio";
import { remoteResourceToLocal } from "@/utils/resouce";
import { getHomeDir, readBinaryFile } from "@/commands/file";

import type { PodcastScriptLine } from "@/types/minimax";

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

interface CloneVoiceItem {
  id: string;
  voiceId: string;
  voiceIdError: string;
  audioFiles: AudioFileItem[];
}

interface AudioFileItem {
  id: string;
  file: File;
  name: string;
  size: number;
  type: string;
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

    // 片段编辑和重生成状态
    const [editingSegmentIndex, setEditingSegmentIndex] = useState<
      number | null
    >(null);
    const [editingSegmentText, setEditingSegmentText] = useState<string>("");
    const [regeneratingSegmentIndex, setRegeneratingSegmentIndex] = useState<
      number | null
    >(null);
    const [extractingAudioIndex, setExtractingAudioIndex] = useState<
      number | null
    >(null);

    // 音频播放状态
    const [playingSegmentIndex, setPlayingSegmentIndex] = useState<
      number | null
    >(null);
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
      setInitialState, // 需要在 usePodcastGeneration 中添加这个方法
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

        // 调用 usePodcastGeneration 的 setInitialState
        setInitialState({
          status: "complete",
          audioUrl: initialPodcast.audioUrl,
          script: initialPodcast.script,
          scriptLines: initialPodcast.scriptLines || [],
          duration: initialPodcast.duration,
          segmentAudios: [], // 编辑模式下可能没有 segmentAudios，需要处理
        });
      }
    }, [open, initialPodcast, setInitialState]);

    const stageNames: Record<string, string> = {
      parsing: "解析内容",
      script: "生成脚本",
      tts: "合成语音",
      music: "生成音乐",
      merging: "合并音频",
      upload: "上传音频",
      complete: "完成",
    };

    type NoticeType = "success" | "error" | "warning" | "info";
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

    const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
    const openFilePicker = useCallback((id: string) => {
      fileInputRefs.current[id]?.click();
    }, []);

    const handleAddCloneFiles = useCallback(
      (cloneId: string, files: FileList | null) => {
        if (!files || files.length === 0) return;

        const maxSize = 20 * 1024 * 1024;
        const allowedTypes = [
          "audio/mpeg",
          "audio/mp4",
          "audio/x-m4a",
          "audio/wav",
        ];

        setCloneItems((prev) =>
          prev.map((item) => {
            if (item.id !== cloneId) return item;
            const next = [...item.audioFiles];
            for (const file of Array.from(files)) {
              if (next.length >= 5) {
                notify("warning", "每个音色最多上传 5 个音频");
                break;
              }
              if (file.size > maxSize) {
                notify("error", `文件 ${file.name} 大小不能超过 20MB`);
                continue;
              }
              if (!allowedTypes.includes(file.type)) {
                notify("error", `文件 ${file.name} 格式不支持`);
                continue;
              }
              next.push({
                id: `${Date.now()}-${Math.random()}`,
                file,
                name: file.name,
                size: file.size,
                type: file.type,
              });
            }
            return { ...item, audioFiles: next };
          }),
        );
      },
      [notify],
    );

    const handleRemoveCloneFile = useCallback(
      (cloneId: string, fileId: string) => {
        setCloneItems((prev) =>
          prev.map((item) =>
            item.id === cloneId
              ? {
                  ...item,
                  audioFiles: item.audioFiles.filter((f) => f.id !== fileId),
                }
              : item,
          ),
        );
      },
      [],
    );

    const addSpeaker = useCallback(() => {
      if (speakers.length >= 5) {
        notify("warning", "最多支持 5 个说话人");
        return;
      }
      const newIndex = speakers.length + 1;
      // 默认新增的说话人为嘉宾
      setSpeakers([
        ...speakers,
        {
          name: `Speaker${newIndex}`,
          voiceId: "",
          voiceName: "",
          role: SpeakerRole.Guest,
        },
      ]);
    }, [speakers, notify]);

    const removeSpeaker = useCallback(
      (index: number) => {
        if (speakers.length <= 2) {
          notify("warning", "至少需要 2 个说话人");
          return;
        }
        setSpeakers(speakers.filter((_, i) => i !== index));
      },
      [speakers, notify],
    );

    const updateSpeaker = useCallback(
      (
        index: number,
        field: keyof PodcastSpeaker,
        value: string | SpeakerRole,
      ) => {
        const newSpeakers = [...speakers];
        newSpeakers[index] = { ...newSpeakers[index], [field]: value };

        // 如果更新了 voiceId，同时更新 voiceName
        if (field === "voiceId") {
          const voice = voices.find((v) => v.voice_id === (value as string));
          if (voice) {
            newSpeakers[index].voiceName = voice.voice_name || voice.voice_id;
          }
        }

        setSpeakers(newSpeakers);
      },
      [speakers, voices],
    );

    const handleGenerate = useCallback(async () => {
      // 验证
      if (speakers.some((s) => !s.voiceId)) {
        notify("error", "请为所有说话人选择音色");
        return;
      }

      if (!podcastName.trim()) {
        notify("error", "请输入播客名称");
        return;
      }

      // 提取卡片内容
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
      // 停止正在播放的音频
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
      setEditingSegmentIndex(null);
      setEditingSegmentText("");
      setRegeneratingSegmentIndex(null);
      setExtractingAudioIndex(null);
      setPlayingSegmentIndex(null);
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

    // 验证 voice_id
    const validateVoiceId = useCallback(
      (voiceId: string): string => {
        if (!voiceId || voiceId.trim().length === 0) {
          return "Voice ID 不能为空";
        }

        const trimmedId = voiceId.trim();

        if (trimmedId.length < 8) {
          return "Voice ID 至少需要 8 个字符";
        }

        if (trimmedId.length > 20) {
          return "Voice ID 不能超过 20 个字符";
        }

        // 检查是否只包含字母、数字、下划线和连字符
        if (!/^[a-zA-Z0-9_-]+$/.test(trimmedId)) {
          return "Voice ID 只能包含字母、数字、下划线和连字符";
        }

        // 检查是否与已有音色重复
        const existingVoice = voices.find((v) => v.voice_id === trimmedId);
        if (existingVoice) {
          return "该 Voice ID 已存在，请使用不同的 ID";
        }

        return "";
      },
      [voices],
    );

    // 添加克隆项
    const addCloneItem = useCallback(() => {
      if (cloneItems.length >= 5) {
        notify("warning", "最多支持同时克隆 5 个音色");
        return;
      }
      setCloneItems([
        ...cloneItems,
        {
          id: Date.now().toString(),
          voiceId: "",
          voiceIdError: "",
          audioFiles: [],
        },
      ]);
    }, [cloneItems, notify]);

    // 删除克隆项
    const removeCloneItem = useCallback(
      (id: string) => {
        if (cloneItems.length <= 1) {
          notify("warning", "至少需要保留一个克隆项");
          return;
        }
        setCloneItems(cloneItems.filter((item) => item.id !== id));
      },
      [cloneItems, notify],
    );

    // 更新克隆项的 voice_id
    const updateCloneItemVoiceId = useCallback(
      (id: string, voiceId: string) => {
        setCloneItems((prev) =>
          prev.map((item) => {
            if (item.id === id) {
              const error = validateVoiceId(voiceId);
              return { ...item, voiceId, voiceIdError: error };
            }
            return item;
          }),
        );
      },
      [validateVoiceId],
    );

    // 处理音色克隆
    const handleCloneVoice = useCallback(async () => {
      // 1. 验证所有克隆项
      const validationErrors: string[] = [];

      for (let i = 0; i < cloneItems.length; i++) {
        const item = cloneItems[i];

        // 验证 voice_id
        if (item.voiceIdError) {
          validationErrors.push(`克隆项 ${i + 1}: ${item.voiceIdError}`);
          continue;
        }

        if (!item.voiceId.trim() || item.voiceId.length < 8) {
          validationErrors.push(`克隆项 ${i + 1}: Voice ID 格式不正确`);
          continue;
        }

        // 验证音频文件
        if (item.audioFiles.length === 0) {
          validationErrors.push(`克隆项 ${i + 1}: 请上传至少一个音频文件`);
        }
      }

      if (validationErrors.length > 0) {
        notify("error", validationErrors[0]);
        return;
      }

      // 2. 验证 API Key
      if (!minimaxApiKey) {
        notify("error", "请先配置 Minimax API Key");
        return;
      }

      setCloneLoading(true);
      let successCount = 0;
      const totalVoices = cloneItems.length;

      try {
        notify("info", `开始克隆音色，共 ${totalVoices} 个音色...`);

        // 3. 逐个处理每个克隆项
        for (let i = 0; i < cloneItems.length; i++) {
          const item = cloneItems[i];
          const voiceNum = i + 1;
          const voiceId = item.voiceId.trim();

          try {
            notify(
              "info",
              `[${voiceNum}/${totalVoices}] 开始处理音色: ${voiceId}`,
            );

            // 处理该音色的所有音频文件
            for (let j = 0; j < item.audioFiles.length; j++) {
              const fileItem = item.audioFiles[j];
              const fileNum = j + 1;

              notify(
                "info",
                `[${voiceNum}/${totalVoices}] 正在上传音频 ${fileNum}/${item.audioFiles.length}: ${fileItem.name}`,
              );

              // 上传音频文件
              const fileId = await uploadReferenceAudio(
                fileItem.file,
                minimaxApiKey,
              );

              // 克隆音色
              await cloneVoice(fileId, voiceId, minimaxApiKey);
            }

            // 手动添加到音色列表
            addVoiceToList(voiceId, voiceId);

            successCount++;
            notify(
              "success",
              `[${voiceNum}/${totalVoices}] 音色 ${voiceId} 克隆成功`,
            );
          } catch (error) {
            console.error(`处理音色 ${voiceId} 失败:`, error);
            notify(
              "error",
              `[${voiceNum}/${totalVoices}] 音色 ${voiceId} 克隆失败: ${(error as Error).message}`,
            );
          }
        }

        // 4. 显示最终结果
        if (successCount === 0) {
          throw new Error("所有音色都克隆失败");
        }

        if (successCount === totalVoices) {
          notify("success", `成功克隆 ${successCount} 个音色！`);
        } else {
          notify(
            "warning",
            `部分成功：成功克隆 ${successCount}/${totalVoices} 个音色`,
          );
        }

        // 5. 重置表单
        setShowCloneForm(false);
        setCloneItems([
          {
            id: Date.now().toString(),
            voiceId: "",
            voiceIdError: "",
            audioFiles: [],
          },
        ]);
      } catch (error) {
        notify("error", (error as Error).message || "音色克隆失败");
      } finally {
        setCloneLoading(false);
      }
    }, [cloneItems, minimaxApiKey, addVoiceToList, notify]);

    // 开始编辑片段
    const handleStartEditSegment = useCallback(
      (index: number, currentText: string) => {
        setEditingSegmentIndex(index);
        setEditingSegmentText(currentText);
      },
      [],
    );

    // 取消编辑片段
    const handleCancelEditSegment = useCallback(() => {
      setEditingSegmentIndex(null);
      setEditingSegmentText("");
    }, []);

    // 确认编辑并重新生成
    const handleConfirmEditSegment = useCallback(async () => {
      if (editingSegmentIndex === null) return;

      const newText = editingSegmentText.trim();
      if (!newText) {
        notify("error", "文本不能为空");
        return;
      }

      const oldText = scriptLines[editingSegmentIndex].text;
      if (newText === oldText) {
        notify("info", "文本未改变");
        handleCancelEditSegment();
        return;
      }

      setRegeneratingSegmentIndex(editingSegmentIndex);
      setEditingSegmentIndex(null);
      setEditingSegmentText("");

      try {
        await regenerateSegment(editingSegmentIndex, newText);
      } finally {
        setRegeneratingSegmentIndex(null);
      }
    }, [
      editingSegmentIndex,
      editingSegmentText,
      notify,
      scriptLines,
      regenerateSegment,
      handleCancelEditSegment,
    ]);

    // 停止当前播放的音频
    const stopCurrentAudio = useCallback(() => {
      if (currentAudioRef.current) {
        currentAudioRef.current.pause();
        currentAudioRef.current = null;
      }
      setPlayingSegmentIndex(null);
    }, []);

    // 试听片段
    const handlePlaySegment = useCallback(
      async (index: number) => {
        // 如果点击的是正在播放的片段，则停止播放
        if (playingSegmentIndex === index) {
          stopCurrentAudio();
          return;
        }

        // 如果有其他音频正在播放，先停止
        if (currentAudioRef.current) {
          stopCurrentAudio();
        }

        // 如果有现成的片段音频，直接播放
        if (segmentAudios[index]) {
          const audio = new Audio(URL.createObjectURL(segmentAudios[index]));
          currentAudioRef.current = audio;
          setPlayingSegmentIndex(index);

          audio.play();

          audio.onended = () => {
            setPlayingSegmentIndex(null);
            currentAudioRef.current = null;
          };

          audio.onerror = () => {
            setPlayingSegmentIndex(null);
            currentAudioRef.current = null;
            notify("error", "音频播放失败");
          };

          return;
        }

        // 否则需要从完整音频中提取
        if (!audioUrl) {
          notify("error", "音频不可用");
          return;
        }

        setExtractingAudioIndex(index);
        try {
          // 获取本地音频路径
          let localAudioPath = "";
          if (audioUrl.startsWith("http")) {
            localAudioPath = await remoteResourceToLocal(audioUrl);
          } else if (audioUrl.startsWith("~")) {
            const homeDir = await getHomeDir();
            localAudioPath = `${homeDir}${audioUrl.slice(1)}`;
          } else {
            localAudioPath = audioUrl;
          }

          // 提取片段
          const { outputPath } = await extractPodcastSegment(
            localAudioPath,
            scriptLines[index].startTime,
            scriptLines[index].duration,
          );

          // 读取二进制文件并创建 Blob URL
          const audioBuffer = (await readBinaryFile(
            outputPath,
          )) as Uint8Array<ArrayBuffer>;
          const audioBlob = new Blob([audioBuffer.buffer], {
            type: "audio/mpeg",
          });
          const audioBlobUrl = URL.createObjectURL(audioBlob);

          // 播放
          const audio = new Audio(audioBlobUrl);
          currentAudioRef.current = audio;
          setPlayingSegmentIndex(index);

          audio.play();

          // 播放结束后释放 Blob URL 和状态
          audio.onended = () => {
            URL.revokeObjectURL(audioBlobUrl);
            setPlayingSegmentIndex(null);
            currentAudioRef.current = null;
          };

          audio.onerror = () => {
            URL.revokeObjectURL(audioBlobUrl);
            setPlayingSegmentIndex(null);
            currentAudioRef.current = null;
            notify("error", "音频播放失败");
          };
        } catch (error) {
          console.error("提取音频片段失败:", error);
          notify("error", "提取音频片段失败");
        } finally {
          setExtractingAudioIndex(null);
        }
      },
      [
        segmentAudios,
        audioUrl,
        notify,
        scriptLines,
        playingSegmentIndex,
        stopCurrentAudio,
      ],
    );

    const footerNode =
      status === "complete" ? (
        <div className="flex gap-3 justify-end">
          <Button onClick={handleClose}>关闭</Button>
          <Button variant="primary" onClick={handleSuccess}>
            {saveText ?? "保存到卡片"}
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
        bodyScrollable={false}
        bodyClassName="pt-3"
      >
        <div className="space-y-6">
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
              {voicesLoading && (
                <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-slate-400">
                  <svg
                    className="w-3.5 h-3.5 animate-spin"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <circle cx="12" cy="12" r="9" strokeOpacity="0.25" />
                    <path d="M12 3a9 9 0 0 1 9 9" strokeLinecap="round" />
                  </svg>
                  正在加载音色...
                </div>
              )}
              <div className="space-y-3">
                {speakers.map((speaker, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <TextInput
                      placeholder="名称"
                      value={speaker.name}
                      onChange={(value) =>
                        updateSpeaker(index, "name", value)
                      }
                      className="w-[120px] shrink-0 h-7 text-xs px-2"
                    />
                    <SelectField
                      value={speaker.role}
                      onChange={(value) =>
                        updateSpeaker(index, "role", value)
                      }
                      className="w-[100px] shrink-0"
                      size="small"
                      options={[
                        {
                          value: SpeakerRole.Host,
                          label: SpeakerRole.Host,
                        },
                        {
                          value: SpeakerRole.Guest,
                          label: SpeakerRole.Guest,
                        },
                      ]}
                    />
                    <SelectField
                      placeholder="选择音色"
                      value={speaker.voiceId || undefined}
                      onChange={(value) =>
                        updateSpeaker(index, "voiceId", value)
                      }
                      className="flex-1 min-w-0"
                      searchable
                      options={voices.map((voice) => ({
                        value: voice.voice_id,
                        label: (
                          <div>
                            <div>{voice.voice_name || voice.voice_id}</div>
                            {voice.description &&
                              voice.description.length > 0 && (
                                <TextSecondary className="text-xs">
                                  {voice.description[0]}
                                </TextSecondary>
                              )}
                          </div>
                        ),
                        searchText: `${voice.voice_name || ""} ${voice.voice_id} ${
                          voice.description?.[0] || ""
                        }`,
                      }))}
                    />
                    {speakers.length > 2 && (
                      <Button
                        icon={<Trash2 size={14} />}
                        variant="danger"
                        size="small"
                        className="w-7 h-7 px-0 rounded-lg shrink-0"
                        onClick={() => removeSpeaker(index)}
                      />
                    )}
                  </div>
                ))}
              </div>

              {speakers.length < 5 && (
                <Button
                  icon={<Plus size={14} />}
                  onClick={addSpeaker}
                  block
                  variant="dashed"
                  className="mt-4"
                >
                  添加说话人
                </Button>
              )}

              {/* 音色克隆功能 */}
              <div className="mt-4 pt-4 border-t border-gray-200 dark:border-slate-700">
                <Button
                  icon={<Volume2 size={14} />}
                  onClick={() => setShowCloneForm(!showCloneForm)}
                  variant="dashed"
                  block
                >
                  {showCloneForm ? "隐藏音色克隆" : "克隆自定义音色"}
                </Button>

                {showCloneForm && (
                  <div className="mt-4 p-4 bg-gray-50 dark:bg-slate-800/50 rounded space-y-4">
                    <TextStrong className="block mb-2">音色克隆列表</TextStrong>

                    <div className="space-y-3 max-h-[40vh] overflow-y-auto pr-1">
                      {cloneItems.map((item, index) => (
                        <div
                          key={item.id}
                          className="p-4 bg-white dark:bg-slate-900 rounded border border-gray-200 dark:border-slate-700 space-y-3"
                        >
                          <div className="flex items-center justify-between">
                            <TextStrong>音色 {index + 1}</TextStrong>
                            {cloneItems.length > 1 && (
                              <Button
                                size="small"
                                variant="danger"
                                icon={<Trash2 size={14} />}
                                onClick={() => removeCloneItem(item.id)}
                              >
                                删除
                              </Button>
                            )}
                          </div>

                          <div>
                            <TextStrong className="text-sm">Voice ID</TextStrong>
                            <TextSecondary className="text-xs ml-2">
                              （8-20字符，字母数字下划线连字符）
                            </TextSecondary>
                            <TextInput
                              placeholder="例如: my_voice_001"
                              value={item.voiceId}
                              onChange={(value) =>
                                updateCloneItemVoiceId(item.id, value)
                              }
                              maxLength={20}
                              className="mt-1"
                              error={!!item.voiceIdError}
                            />
                            {item.voiceIdError && (
                              <div className="text-xs text-red-600 dark:text-red-400 mt-1">
                                {item.voiceIdError}
                              </div>
                            )}
                            {item.voiceId &&
                              !item.voiceIdError &&
                              item.voiceId.length >= 8 && (
                                <div className="text-xs text-green-600 dark:text-green-400 mt-1">
                                  ✓ Voice ID 格式正确
                                </div>
                              )}
                          </div>

                          <div>
                            <TextStrong className="text-sm">参考音频</TextStrong>
                            <TextSecondary className="text-xs ml-2">
                              (mp3/m4a/wav, 10秒-5分钟, &lt;20MB)
                            </TextSecondary>

                            <input
                              ref={(el) => {
                                fileInputRefs.current[item.id] = el;
                              }}
                              type="file"
                              accept=".mp3,.m4a,.wav"
                              multiple
                              className="hidden"
                              onChange={(e) => {
                                handleAddCloneFiles(item.id, e.target.files);
                                e.currentTarget.value = "";
                              }}
                            />
                            <div className="mt-1 flex items-center gap-2">
                              <Button
                                icon={<Upload size={14} />}
                                size="small"
                                onClick={() => openFilePicker(item.id)}
                              >
                                选择音频{" "}
                                {item.audioFiles.length > 0 &&
                                  `(${item.audioFiles.length}/5)`}
                              </Button>
                            </div>

                            {item.audioFiles.length > 0 && (
                              <div className="mt-2 space-y-1">
                                {item.audioFiles.map((file) => (
                                  <div
                                    key={file.id}
                                    className="flex items-center justify-between gap-2 text-xs bg-gray-50 dark:bg-slate-800/60 px-2 py-1 rounded"
                                  >
                                    <span className="truncate flex-1">
                                      {file.name}
                                    </span>
                                    <Button
                                      size="small"
                                      variant="text"
                                      icon={<Trash2 size={12} />}
                                      className="w-6 h-6 px-0 rounded-md"
                                      onClick={() =>
                                        handleRemoveCloneFile(
                                          item.id,
                                          file.id,
                                        )
                                      }
                                    />
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>

                    {cloneItems.length < 5 && (
                      <Button
                        icon={<Plus size={14} />}
                        onClick={addCloneItem}
                        block
                        variant="dashed"
                      >
                        添加音色克隆项 ({cloneItems.length}/5)
                      </Button>
                    )}

                    <TextSecondary className="text-xs block">
                      <div className="space-y-1">
                        <div>✓ 每个音色都需要独立的 Voice ID</div>
                        <div>
                          ✓ 每个音色可上传多个音频（最多5个），会自动合并
                        </div>
                        <div>✓ 音频要求：清晰的单人语音，时长 10秒-5分钟</div>
                        <div>✓ 可同时克隆最多 5 个不同的音色</div>
                      </div>
                    </TextSecondary>

                    <Button
                      variant="primary"
                      onClick={handleCloneVoice}
                      loading={cloneLoading}
                      disabled={cloneItems.some(
                        (item) =>
                          !item.voiceId.trim() ||
                          item.audioFiles.length === 0 ||
                          !!item.voiceIdError ||
                          item.voiceId.length < 8,
                      )}
                      block
                    >
                      开始批量克隆 ({cloneItems.length} 个音色)
                    </Button>
                  </div>
                )}
              </div>
            </div>
          )}

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
                  <TextSecondary className="text-xs">1-15</TextSecondary>
                </div>
              </div>

              <TextSecondary className="text-xs">
                当前: {durationRange[0]} - {durationRange[1]} 分钟
              </TextSecondary>

              {/* <div className="flex items-center justify-between">
              <Text>生成背景音乐</Text>
              <Switch
                checked={generateMusic}
                onChange={setGenerateMusic}
              />
            </div>
            <Text type="secondary" className="text-xs mt-2">
              注意：背景音乐功能待实现
            </Text> */}
            </div>
          )}

          {/* 脚本编辑阶段 */}
          {status === "loading" &&
            stage === "script" &&
            scriptLines.length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <SectionTitle>编辑脚本</SectionTitle>
                  <div className="flex gap-2">
                    <Button onClick={() => reset()}>取消</Button>
                    <Button
                      variant="primary"
                      onClick={() =>
                        continueWithTTS(scriptLines, generateMusic)
                      }
                    >
                      确认并生成音频
                    </Button>
                  </div>
                </div>

                <div className="max-h-[60vh] overflow-y-auto space-y-3 pr-2">
                  {scriptLines.map((line, index) => (
                    <div
                      key={index}
                      className="p-3 bg-gray-50 dark:bg-slate-800/50 rounded border border-gray-200 dark:border-slate-700 flex gap-3 items-start group"
                    >
                      <div className="flex flex-col gap-2 pt-1">
                        <SelectField
                          value={line.speaker}
                          onChange={(value) => {
                            const speaker = speakers.find(
                              (s) => s.name === value,
                            );
                            if (speaker) {
                              const newLines = [...scriptLines];
                              newLines[index] = {
                                ...line,
                                speaker: value,
                                voiceId: speaker.voiceId,
                              };
                              updateScriptLines(newLines);
                            }
                          }}
                          className="w-[120px]"
                          size="small"
                          options={speakers.map((s) => ({
                            value: s.name,
                            label: s.name,
                          }))}
                        />
                        <div className="flex gap-1">
                          <Button
                            size="small"
                            icon={<ChevronUp size={14} />}
                            disabled={index === 0}
                            className="w-7 h-7 px-0 rounded-md"
                            onClick={() => {
                              const newLines = [...scriptLines];
                              [newLines[index - 1], newLines[index]] = [
                                newLines[index],
                                newLines[index - 1],
                              ];
                              updateScriptLines(newLines);
                            }}
                          />
                          <Button
                            size="small"
                            icon={<ChevronDown size={14} />}
                            disabled={index === scriptLines.length - 1}
                            className="w-7 h-7 px-0 rounded-md"
                            onClick={() => {
                              const newLines = [...scriptLines];
                              [newLines[index + 1], newLines[index]] = [
                                newLines[index],
                                newLines[index + 1],
                              ];
                              updateScriptLines(newLines);
                            }}
                          />
                          <Button
                            size="small"
                            icon={<Trash2 size={14} />}
                            variant="danger"
                            className="w-7 h-7 px-0 rounded-md"
                            onClick={() => {
                              const newLines = scriptLines.filter(
                                (_, i) => i !== index,
                              );
                              updateScriptLines(newLines);
                            }}
                          />
                        </div>
                      </div>

                      <TextArea
                        value={line.text}
                        onChange={(value) => {
                          const newLines = [...scriptLines];
                          newLines[index] = { ...line, text: value };
                          updateScriptLines(newLines);
                        }}
                        autoSize={{ minRows: 2, maxRows: 6 }}
                        className="flex-1"
                      />
                    </div>
                  ))}

                  <Button
                    block
                    icon={<Plus size={14} />}
                    variant="dashed"
                    onClick={() => {
                      const lastLine = scriptLines[scriptLines.length - 1];
                      const nextSpeaker =
                        speakers.find((s) => s.name !== lastLine?.speaker) ||
                        speakers[0];
                      updateScriptLines([
                        ...scriptLines,
                        {
                          speaker: nextSpeaker.name,
                          text: "",
                          voiceId: nextSpeaker.voiceId,
                          startTime: 0,
                          duration: 0,
                        },
                      ]);
                    }}
                  >
                    添加对话
                  </Button>
                </div>
              </div>
            )}

          {/* 进度显示 (非脚本编辑阶段) */}
          {status === "loading" &&
            (stage !== "script" || scriptLines.length === 0) && (
              <div className="space-y-4">
                <SectionTitle>
                  {stageNames[stage] || stage}
                  {stage === "tts" && ` (${ttsCompleted}/${ttsTotal})`}
                </SectionTitle>
                <div className="w-full h-2 rounded-full bg-gray-200 dark:bg-slate-700 overflow-hidden">
                  <div
                    className="h-full bg-indigo-500 transition-all"
                    style={{ width: `${stageProgress}%` }}
                  />
                </div>

                <details open className="mt-4">
                  <summary className="cursor-pointer text-sm font-medium text-gray-700 dark:text-slate-200 flex items-center justify-between">
                    详细日志
                  </summary>
                  <div className="mt-2 max-h-64 overflow-y-auto space-y-1 bg-gray-50 dark:bg-slate-800/60 p-2 rounded">
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

              <SectionTitle>
                <Volume2 size={16} className="inline-block mr-1" /> 播客音频
              </SectionTitle>
              <audio
                key={audioUrl}
                controls
                className="w-full mb-4"
                src={audioUrl}
              />
              <TextSecondary className="text-sm">
                时长: {Math.floor(duration / 60)}:
                {(duration % 60).toString().padStart(2, "0")}
              </TextSecondary>

              <details open className="mt-4">
                <summary className="cursor-pointer text-sm font-medium text-gray-700 dark:text-slate-200 flex items-center gap-2">
                  <FileText size={16} className="inline-block" /> 查看脚本
                </summary>
                  <div className="overflow-y-auto flex flex-col gap-3 p-4 rounded max-h-[400px]">
                    {scriptLines.map((line, index) => {
                      const isEditing = editingSegmentIndex === index;
                      const isRegenerating = regeneratingSegmentIndex === index;
                      const isExtracting = extractingAudioIndex === index;
                      const isPlaying = playingSegmentIndex === index;

                      return (
                        <div
                          key={index}
                          className={classNames(
                            "p-3 rounded border transition-colors",
                            isEditing
                              ? "bg-blue-50 dark:bg-blue-500/10 border-blue-300 dark:border-blue-500/30"
                              : isRegenerating
                                ? "bg-yellow-50 dark:bg-yellow-500/10 border-yellow-300 dark:border-yellow-500/30"
                                : "bg-gray-50 dark:bg-slate-800/50 border-gray-200 dark:border-slate-700 hover:border-gray-300 dark:hover:border-slate-600",
                          )}
                        >
                          <div className="flex justify-between items-center mb-2">
                            <div className="flex items-center gap-2">
                              <TextStrong>{line.speaker}</TextStrong>
                              <TextSecondary className="text-xs">
                                {formatTime(line.startTime)} -{" "}
                                {formatTime(line.startTime + line.duration)} (
                                {line.duration.toFixed(1)}s)
                              </TextSecondary>
                              {isRegenerating && (
                                <TextSecondary className="text-xs text-yellow-700 dark:text-yellow-400">
                                  正在重新生成...
                                </TextSecondary>
                              )}
                            </div>
                            {!isEditing && !isRegenerating && (
                              <div className="flex gap-2">
                                <Button
                                  size="small"
                                  variant={isPlaying ? "primary" : "text"}
                                  icon={
                                    isPlaying ? (
                                      <Pause size={14} />
                                    ) : (
                                      <Volume2 size={14} />
                                    )
                                  }
                                  loading={isExtracting}
                                  onClick={() => handlePlaySegment(index)}
                                >
                                  {isPlaying ? "停止试听" : "试听"}
                                </Button>
                                <Button
                                  size="small"
                                  variant="text"
                                  icon={<RefreshCw size={14} />}
                                  onClick={() =>
                                    handleStartEditSegment(index, line.text)
                                  }
                                >
                                  重生成
                                </Button>
                              </div>
                            )}
                          </div>

                          {isEditing ? (
                            <div className="space-y-2">
                              <TextArea
                                value={editingSegmentText}
                                onChange={setEditingSegmentText}
                                autoSize={{ minRows: 2, maxRows: 8 }}
                                autoFocus
                                placeholder="请输入文本内容"
                              />
                              <div className="flex justify-end gap-2">
                                <Button
                                  size="small"
                                  onClick={handleCancelEditSegment}
                                >
                                  取消
                                </Button>
                                <Button
                                  size="small"
                                  variant="primary"
                                  onClick={handleConfirmEditSegment}
                                  disabled={!editingSegmentText.trim()}
                                >
                                  确定并重新生成
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <div className="text-gray-700 dark:text-slate-200 whitespace-pre-wrap">
                              {line.text}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
              </details>
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
                <div className="mt-2 max-h-64 overflow-y-auto space-y-1 bg-gray-50 dark:bg-slate-800/60 p-2 rounded">
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

// 辅助函数：格式化时间
function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function normalizeDurationRange(min: number, max: number): [number, number] {
  const clamp = (value: number) => {
    if (Number.isNaN(value)) return 1;
    return Math.min(15, Math.max(1, Math.round(value)));
  };
  const a = clamp(min);
  const b = clamp(max);
  return a <= b ? [a, b] : [b, a];
}

export default PodcastGenerationModal;
