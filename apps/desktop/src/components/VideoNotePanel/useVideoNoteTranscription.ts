import type { TranscriptionProgress } from "../../../shared/media-progress";
import { useVideoTranscriptionI18n } from "./video-transcription.i18n";
import {
  createVideoLlmConfirm,
  videoTranscriptionProgressText,
  videoTranscriptionT,
  videoTranscriptionFailureText,
  type VideoTranscriptionProgress,
} from "./video-transcription.binding";
import { VideoTranscriptionFailure } from "./video-transcription-error";
/**
 * 视频笔记转录流程：取本地视频 → 提取音频 → （长视频分段）转录 → 可选 AI 断句优化 → 落库。
 * 项目条目视频页与白板视频抽屉共用；落库后经 onTranscriptSaved 把新转录回写给宿主。
 */

import {
  localTranscriptionOptions,
  type LocalTranscriptionSelection,
} from "../../../shared/local-transcription";
import { useEffect, useRef, useState } from "react";
import { useMemoizedFn } from "ahooks";
import { toast } from "@tau/ui";
import { useSettingsStore } from "@/app/settingsStore";
import { aiNotifyText } from "@/services/notifications/ai.i18n";
import {
  isCurrentDatabase,
  isSurfaceActive,
  notifyAiTask,
  registerActiveSurface,
} from "@/services/notifications/aiNotify";
import { bindDatabaseCommands } from "@/services/command-context";
import useSettingStore from "@/stores/useSettingStore";
import { getModels } from "@/commands/model-downloader";
import { requiredModels } from "../../../shared/local-transcription";
import { updateVideoNoteTranscript } from "@/commands";
import {
  transcribeAudio,
  extractAudioFromVideo,
  shouldSegmentAudio,
  transcribeAudioSegmented,
} from "@/commands/transcription";
import { checkLLMOptimizationConfig, defaultTranscriptionSelection } from "@/utils/transcription";
import { useLLMConfig } from "@/hooks/useLLMConfig";
import { useTranscriptionOptimization } from "@/hooks/useTranscriptionOptimization";
import { ensureOnlineVideo } from "@/commands/online-video-cache";
import {
  downloadRemoteVideoWithProgress,
  getRemoteVideoCacheStatus,
} from "@/commands/remote-video-cache";
import {
  isLocalVideoMeta,
  isRemoteVideoMeta,
  type VideoNote,
  type TranscriptSegment,
} from "@/types";
import { onlineVideoRef } from "@/types/online-video";
import { resolveVideoNoteOptimizationLanguage } from "./transcription-language";
import { useVideoNoteCaptions } from "./useVideoNoteCaptions";

export interface TranscriptPatch {
  transcript: string;
  transcriptSegments: TranscriptSegment[];
  transcriptWordSegments?: TranscriptSegment[];
}

export interface LLMConfirmRequest {
  title: string;
  description: string;
}

interface UseVideoNoteTranscriptionOptions {
  videoNote: VideoNote | null;
  language: string;
  onTranscriptSaved: (patch: TranscriptPatch) => void;
}

const isRemoteHttpUrl = (value: string) =>
  /^https?:\/\//i.test(value) && !/^https?:\/\/localhost/i.test(value);

export function useVideoNoteTranscription({
  videoNote,
  language,
  onTranscriptSaved,
}: UseVideoNoteTranscriptionOptions) {
  useVideoTranscriptionI18n();
  const {
    provider,
    model,
    thinkingLevel: transcriptionThinkingLevel,
  } = useLLMConfig("transcriptionOptimization");
  const { isOptimizing, streamingSegments, startOptimization, stopOptimization } =
    useTranscriptionOptimization(provider, model, transcriptionThinkingLevel);

  const [isTranscribing, setIsTranscribing] = useState(false);
  const isLoadingCaptions = useVideoNoteCaptions(videoNote, isTranscribing, onTranscriptSaved);
  const [progress, setProgress] = useState<VideoTranscriptionProgress | null>(null);
  const [optionsRequest, setOptionsRequest] = useState<{
    language: string;
    initialSelection: LocalTranscriptionSelection;
  } | null>(null);
  const [detectedLanguage, setDetectedLanguage] = useState<string | null>(null);
  /** LLM 配置缺失时请宿主弹确认框（打开设置） */
  const [llmConfirm, setLlmConfirm] = useState<LLMConfirmRequest | null>(null);

  const videoNoteId = videoNote?.id;
  const databaseName = useSettingStore(state => state.setting.database.active);
  const visibleVideo = useRef(videoNoteId);
  const optimizationTask = useRef<AbortController | null>(null);
  visibleVideo.current = videoNoteId;
  const transcriptCommands = bindDatabaseCommands({ updateVideoNoteTranscript }, { databaseName });

  useEffect(() => {
    setDetectedLanguage(null);
  }, [videoNoteId]);

  useEffect(() => {
    if (!videoNoteId) return;
    return registerActiveSurface(`video-note:${videoNoteId}`);
  }, [videoNoteId]);

  const isOnVideoSurface = () =>
    Boolean(videoNoteId) &&
    !useSettingsStore.getState().open &&
    isSurfaceActive(`video-note:${videoNoteId}`);

  const finish = () => {
    setIsTranscribing(false);
    setProgress(null);
  };

  const getVideoLocalPath = async (): Promise<string | null> => {
    if (!videoNote) return null;
    const { metaInfo } = videoNote;

    const getRemoteVideoLocalPath = async (remoteUrl: string) => {
      const status = await getRemoteVideoCacheStatus(remoteUrl);
      if (status?.localPath) return status.localPath;

      setProgress({ kind: "downloading" });
      const result = await downloadRemoteVideoWithProgress({ url: remoteUrl }, p => {
        setProgress({
          kind: "service",
          progress: p,
          download: true,
          downloadPercent: typeof p.progress === "number" ? p.progress : undefined,
        });
      });
      return result.localPath || null;
    };

    if (isLocalVideoMeta(metaInfo))
      return isRemoteHttpUrl(metaInfo.filePath)
        ? getRemoteVideoLocalPath(metaInfo.filePath)
        : metaInfo.filePath;
    if (isRemoteVideoMeta(metaInfo)) return getRemoteVideoLocalPath(metaInfo.url);
    const result = await ensureOnlineVideo(
      { providerId: metaInfo.type, ref: onlineVideoRef(metaInfo), title: metaInfo.title },
      {
        onProgress: p => {
          setProgress({
            kind: "service",
            progress: p,
            download: true,
            downloadPercent: typeof p.percent === "number" ? p.percent : undefined,
          });
        },
      }
    );
    return result.localPath;
  };

  const saveTranscript = async (patch: TranscriptPatch) => {
    if (videoNoteId == null) return;
    await transcriptCommands.updateVideoNoteTranscript(
      videoNoteId,
      patch.transcript,
      patch.transcriptSegments,
      // 同时保存词级时间戳，以便后续重新 AI 优化
      patch.transcriptWordSegments
    );
    if (visibleVideo.current === videoNoteId && isCurrentDatabase(databaseName))
      onTranscriptSaved(patch);
  };

  const optimizeAndSave = async (
    wordSegments: TranscriptSegment[],
    language: string,
    keepWords = true
  ) => {
    const controller = new AbortController();
    optimizationTask.current?.abort();
    optimizationTask.current = controller;
    let cancelled = false;
    try {
      const result = await startOptimization(wordSegments, language);
      if (!result || controller.signal.aborted) {
        cancelled = true;
        return;
      }
      setProgress({ kind: "saving" });
      await saveTranscript({
        transcript: result.segments.map(segment => segment.text).join(" "),
        transcriptSegments: result.segments,
        transcriptWordSegments: keepWords ? wordSegments : undefined,
      });
      if (controller.signal.aborted) {
        cancelled = true;
        return;
      }
      const notified = notifyAiTask({
        id: `video-transcription:${databaseName}:${videoNoteId}`,
        title: aiNotifyText(
          result.error ? "transcription.partialDoneTitle" : "transcription.optimizedDoneTitle"
        ),
        body: aiNotifyText("transcription.bodyUntitled"),
        source: aiNotifyText("source.transcription"),
        icon: "audioLines",
        tone: result.error ? "neutral" : "ok",
        databaseName,
        isOnSurface: isOnVideoSurface,
      });
      if (!notified && isCurrentDatabase(databaseName)) {
        if (result.error) toast.warning(videoTranscriptionT("notice.partialOptimization"));
        else toast.success(videoTranscriptionT("notice.optimizedComplete"));
      }
    } catch (error) {
      if (controller.signal.aborted) return;
      console.error("Failed to save optimized transcript:", error);
      const message = videoTranscriptionT("notice.saveFailed");
      const notified = notifyAiTask({
        id: `video-transcription:${databaseName}:${videoNoteId}`,
        title: aiNotifyText("transcription.failedTitle"),
        body: message,
        source: aiNotifyText("source.transcription"),
        icon: "audioLines",
        tone: "danger",
        sticky: true,
        databaseName,
        isOnSurface: isOnVideoSurface,
      });
      if (!notified && isCurrentDatabase(databaseName)) toast.error(message);
    } finally {
      if (!cancelled && optimizationTask.current === controller) finish();
    }
  };

  /** languageOverride：本次转录用指定语言（宿主刚切换语言、状态尚未生效时）；
   *  直接作 onClick 传入时收到的事件对象会被忽略 */
  const transcribe = useMemoizedFn(
    async (
      languageOverride?: unknown,
      selection: LocalTranscriptionSelection = defaultTranscriptionSelection()
    ) => {
      if (!videoNote || isTranscribing) return;
      const lang = typeof languageOverride === "string" ? languageOverride : language;
      const options = { ...localTranscriptionOptions(selection), language: lang };
      const llmRequirement = checkLLMOptimizationConfig();
      if (options.useLLMOptimization && !llmRequirement.isConfigured) {
        setLlmConfirm(createVideoLlmConfirm(llmRequirement));
        return;
      }

      setIsTranscribing(true);
      setProgress({ kind: "preparing" });

      try {
        const catalog = await getModels();
        if (!catalog.success || !catalog.data)
          throw catalog.error ? new Error(catalog.error) : new VideoTranscriptionFailure("models");
        const models = catalog.data;
        if (
          requiredModels(selection, models).some(
            id => !models.some(m => m.name === id && m.downloaded)
          )
        ) {
          setOptionsRequest({ language: lang, initialSelection: selection });
          finish();
          return;
        }
        const videoPath = await getVideoLocalPath();
        if (!videoPath) {
          toast.warning(videoTranscriptionT("notice.notCached"));
          finish();
          return;
        }

        setProgress({ kind: "extracting" });
        const extractResult = await extractAudioFromVideo(videoPath);
        if (!extractResult.success || !extractResult.audioPath) {
          throw extractResult.error
            ? new Error(extractResult.error)
            : new VideoTranscriptionFailure("extract");
        }
        const audioPath = extractResult.audioPath;

        // 长视频分段转录
        const enableLongVideoSegmentation =
          useSettingStore.getState().setting.misc?.transcription?.enableLongVideoSegmentation ??
          true;
        let segmented = false;
        if (enableLongVideoSegmentation) {
          setProgress({ kind: "checking" });
          const segmentCheck = await shouldSegmentAudio(audioPath);
          if (segmentCheck.success && segmentCheck.shouldSegment) {
            const durationMinutes = Math.round((segmentCheck.duration || 0) / 60);
            setProgress({ kind: "segmented", minutes: durationMinutes });
            segmented = true;
          }
        }
        if (!segmented) setProgress({ kind: "transcribing" });

        const run = {
          onProgress: (data: TranscriptionProgress) =>
            setProgress({ kind: "service", progress: data }),
        };
        const result = await (segmented
          ? transcribeAudioSegmented(audioPath, options, run)
          : transcribeAudio(audioPath, options, run));

        if (!result.success || !result.data) {
          throw result.error
            ? new Error(result.error)
            : new VideoTranscriptionFailure("transcribe");
        }

        const detected = result.data.language || null;
        setDetectedLanguage(detected);
        const wordSegments = result.data.wordSegments;

        if (options.useLLMOptimization && result.data.text.trim() && !wordSegments?.length)
          throw new VideoTranscriptionFailure("words");
        if (options.useLLMOptimization && wordSegments?.length) {
          setProgress({ kind: "optimizing" });
          void optimizeAndSave(
            wordSegments,
            resolveVideoNoteOptimizationLanguage(lang, detected),
            selection.keepWords
          );
          return;
        }

        setProgress({ kind: "saving" });
        await saveTranscript({
          transcript: result.data.text,
          transcriptSegments: result.data.segments,
          transcriptWordSegments: selection.keepWords ? wordSegments : undefined,
        });
        finish();
        const notified = notifyAiTask({
          id: `video-transcription:${videoNoteId ?? "current"}`,
          title: aiNotifyText("transcription.doneTitle"),
          body: aiNotifyText("transcription.bodyUntitled"),
          source: aiNotifyText("source.transcription"),
          icon: "audioLines",
          tone: "ok",
          databaseName,
          isOnSurface: isOnVideoSurface,
        });
        if (!notified && isCurrentDatabase(databaseName))
          toast.success(videoTranscriptionT("notice.complete"));
      } catch (error) {
        console.error("Transcription error:", error);
        const message = videoTranscriptionT("error.transcribe", {
          error: videoTranscriptionFailureText(error),
        });
        const notified = notifyAiTask({
          id: `video-transcription:${videoNoteId ?? "current"}`,
          title: aiNotifyText("transcription.failedTitle"),
          body: message,
          source: aiNotifyText("source.transcription"),
          icon: "audioLines",
          tone: "danger",
          sticky: true,
          databaseName,
          isOnSurface: isOnVideoSurface,
        });
        if (!notified && isCurrentDatabase(databaseName)) toast.error(message);
        finish();
      }
    }
  );

  const cancelOptimization = useMemoizedFn(() => {
    optimizationTask.current?.abort();
    stopOptimization();
    finish();
    toast.info(videoTranscriptionT("notice.cancelled"));
  });

  /** 对已有转录单独重跑 AI 断句（需要词级时间戳） */
  const optimize = useMemoizedFn(() => {
    const wordSegments = videoNote?.transcriptWordSegments;
    if (!wordSegments?.length) {
      toast.warning(videoTranscriptionT("notice.noWords"));
      return;
    }
    const llmRequirement = checkLLMOptimizationConfig();
    if (!llmRequirement.isConfigured) {
      setLlmConfirm(createVideoLlmConfirm(llmRequirement));
      return;
    }
    setIsTranscribing(true);
    setProgress({ kind: "optimizing" });
    // 自动模式下无检测结果时回退中文
    void optimizeAndSave(
      wordSegments,
      resolveVideoNoteOptimizationLanguage(language, detectedLanguage)
    );
  });

  return {
    isTranscribing: isTranscribing || isLoadingCaptions,
    progress: isLoadingCaptions
      ? videoTranscriptionT("progress.captions")
      : videoTranscriptionProgressText(progress),
    isOptimizing,
    streamingSegments,
    canOptimize: !!videoNote?.transcriptWordSegments?.length,
    transcribe,
    optimize,
    cancelOptimization,
    optionsRequest,
    openOptions: () =>
      setOptionsRequest({ language, initialSelection: defaultTranscriptionSelection() }),
    closeOptions: () => setOptionsRequest(null),
    llmConfirm,
    dismissLlmConfirm: () => setLlmConfirm(null),
  };
}
