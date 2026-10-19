/**
 * 视频笔记转录流程：取本地视频 → 提取音频 → （长视频分段）转录 → 可选 AI 断句优化 → 落库。
 * 项目条目视频页与白板视频抽屉共用；落库后经 onTranscriptSaved 把新转录回写给宿主。
 */

import { useEffect, useState } from "react";
import { useMemoizedFn } from "ahooks";
import { toast } from "@tau/ui";
import useSettingStore from "@/stores/useSettingStore";
import { updateVideoNoteTranscript } from "@/commands";
import {
  transcribeAudio,
  onTranscriptionProgress,
  extractAudioFromVideo,
  shouldSegmentAudio,
  transcribeAudioSegmented,
} from "@/commands/transcription";
import {
  checkTranscriptionLLMRequirement,
  prepareTranscriptionOptions,
} from "@/utils/transcription";
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
  const { provider, model } = useLLMConfig("transcriptionOptimization");
  const {
    isOptimizing,
    streamingSegments,
    finalSegments: optimizedFinalSegments,
    startOptimization,
    stopOptimization,
    error: optimizationError,
  } = useTranscriptionOptimization(provider, model);

  const [isTranscribing, setIsTranscribing] = useState(false);
  const [progress, setProgress] = useState("");
  const [pendingWordSegments, setPendingWordSegments] = useState<TranscriptSegment[] | null>(null);
  const [detectedLanguage, setDetectedLanguage] = useState<string | null>(null);
  /** LLM 配置缺失时请宿主弹确认框（打开设置） */
  const [llmConfirm, setLlmConfirm] = useState<LLMConfirmRequest | null>(null);

  const videoNoteId = videoNote?.id;

  useEffect(() => {
    setDetectedLanguage(null);
  }, [videoNoteId]);

  const finish = () => {
    setIsTranscribing(false);
    setProgress("");
  };

  const getVideoLocalPath = useMemoizedFn(async (): Promise<string | null> => {
    if (!videoNote) return null;
    const { metaInfo } = videoNote;

    const getRemoteVideoLocalPath = async (remoteUrl: string) => {
      const status = await getRemoteVideoCacheStatus(remoteUrl);
      if (status?.localPath) return status.localPath;

      setProgress("视频尚未缓存，正在下载...");
      const result = await downloadRemoteVideoWithProgress({ url: remoteUrl }, p => {
        const percent = typeof p.progress === "number" ? ` ${Math.round(p.progress)}%` : "";
        setProgress(p.message || `视频尚未缓存，正在下载${percent}...`);
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
          const percent = typeof p.percent === "number" ? ` ${Math.round(p.percent)}%` : "";
          setProgress(p.message || `视频尚未缓存，正在下载${percent}...`);
        },
      }
    );
    return result.localPath;
  });

  const saveTranscript = async (patch: TranscriptPatch) => {
    if (videoNoteId == null) return;
    await updateVideoNoteTranscript(
      videoNoteId,
      patch.transcript,
      patch.transcriptSegments,
      // 同时保存词级时间戳，以便后续重新 AI 优化
      patch.transcriptWordSegments
    );
    onTranscriptSaved(patch);
  };

  /** languageOverride：本次转录用指定语言（宿主刚切换语言、状态尚未生效时）；
   *  直接作 onClick 传入时收到的事件对象会被忽略 */
  const transcribe = useMemoizedFn(async (languageOverride?: unknown) => {
    if (!videoNote) return;
    const lang = typeof languageOverride === "string" ? languageOverride : language;
    if (!useSettingStore.getState().setting.transcription.currentModel) {
      toast.warning("请先在设置中下载转录模型");
      return;
    }

    const llmRequirement = checkTranscriptionLLMRequirement();
    if (llmRequirement.needsLLM && !llmRequirement.isConfigured) {
      setLlmConfirm({
        title: "LLM 优化配置不完整",
        description: `${llmRequirement.errorMessage}。是否打开设置页面进行配置？`,
      });
      return;
    }

    setIsTranscribing(true);
    setProgress("正在准备视频...");

    try {
      const videoPath = await getVideoLocalPath();
      if (!videoPath) {
        toast.warning("视频尚未缓存，请等待视频加载完成后再试");
        finish();
        return;
      }

      setProgress("正在提取音频...");
      const extractResult = await extractAudioFromVideo(videoPath);
      if (!extractResult.success || !extractResult.audioPath) {
        throw new Error(extractResult.error || "提取音频失败");
      }
      const audioPath = extractResult.audioPath;

      // 自动识别模式会透传为 auto
      const options = prepareTranscriptionOptions({ language: lang });

      // 长视频分段转录
      const enableLongVideoSegmentation =
        useSettingStore.getState().setting.misc?.transcription?.enableLongVideoSegmentation ?? true;
      let segmented = false;
      if (enableLongVideoSegmentation) {
        setProgress("正在检查视频时长...");
        const segmentCheck = await shouldSegmentAudio(audioPath);
        if (segmentCheck.success && segmentCheck.shouldSegment) {
          const durationMinutes = Math.round((segmentCheck.duration || 0) / 60);
          setProgress(`长视频检测到 (${durationMinutes} 分钟)，准备分段转录...`);
          segmented = true;
        }
      }
      if (!segmented) setProgress("正在转录 ...");

      const unsubscribe = onTranscriptionProgress(data => setProgress(data.message));
      const result = await (
        segmented
          ? transcribeAudioSegmented(audioPath, options)
          : transcribeAudio(audioPath, options)
      ).finally(unsubscribe);

      if (!result.success || !result.data) {
        throw new Error(result.error || "转录失败");
      }

      const detected = result.data.language || null;
      setDetectedLanguage(detected);
      const wordSegments = result.data.wordSegments;

      if (llmRequirement.needsLLM && wordSegments && wordSegments.length > 0) {
        // 流式优化完成后由下方 effect 落库并结束
        setProgress("正在使用 AI 优化断句...");
        setPendingWordSegments(wordSegments);
        startOptimization(wordSegments, resolveVideoNoteOptimizationLanguage(lang, detected));
        return;
      }

      setProgress("正在保存...");
      await saveTranscript({
        transcript: result.data.text,
        transcriptSegments: result.data.segments,
        transcriptWordSegments: wordSegments,
      });
      finish();
      toast.success("转录完成");
    } catch (error) {
      console.error("Transcription error:", error);
      toast.error(`转录失败: ${error}`);
      finish();
    }
  });

  // 流式优化完成后落库
  useEffect(() => {
    if (!optimizedFinalSegments || isOptimizing || !pendingWordSegments) return;
    const run = async () => {
      try {
        setProgress("正在保存...");
        await saveTranscript({
          transcript: optimizedFinalSegments.map(s => s.text).join(" "),
          transcriptSegments: optimizedFinalSegments,
          transcriptWordSegments: pendingWordSegments,
        });
        if (optimizationError) toast.warning("AI 优化出现错误，使用部分结果");
        else toast.success("转录完成（已使用 AI 优化断句）");
      } catch (error) {
        console.error("Failed to save optimized transcript:", error);
        toast.error("保存失败");
      } finally {
        finish();
        setPendingWordSegments(null);
      }
    };
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [optimizedFinalSegments, isOptimizing, pendingWordSegments, optimizationError]);

  const cancelOptimization = useMemoizedFn(() => {
    stopOptimization();
    finish();
    setPendingWordSegments(null);
    toast.info("优化已取消");
  });

  /** 对已有转录单独重跑 AI 断句（需要词级时间戳） */
  const optimize = useMemoizedFn(() => {
    const wordSegments = videoNote?.transcriptWordSegments;
    if (!wordSegments?.length) {
      toast.warning("没有可用于优化的词级时间戳数据");
      return;
    }
    const llmRequirement = checkTranscriptionLLMRequirement();
    if (!llmRequirement.isConfigured) {
      setLlmConfirm({
        title: "LLM 优化配置不完整",
        description: `${llmRequirement.errorMessage}。是否打开设置页面进行配置？`,
      });
      return;
    }
    setIsTranscribing(true);
    setProgress("正在使用 AI 优化断句...");
    setPendingWordSegments(wordSegments);
    // 自动模式下无检测结果时回退中文
    startOptimization(
      wordSegments,
      resolveVideoNoteOptimizationLanguage(language, detectedLanguage)
    );
  });

  return {
    isTranscribing,
    progress,
    isOptimizing,
    streamingSegments,
    canOptimize: !!videoNote?.transcriptWordSegments?.length,
    transcribe,
    optimize,
    cancelOptimization,
    llmConfirm,
    dismissLlmConfirm: () => setLlmConfirm(null),
  };
}
