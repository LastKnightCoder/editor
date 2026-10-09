/** 播客后半程：逐句合成语音 → 合并 → 上传（与组件无关，后台任务调用） */

import type { PodcastScriptLine } from "@/types/podcast";
import {
  loadSpeechSegment,
  mergeSpeechSegments,
  type SpeechSegment,
} from "@/utils/audio-processor";
import { uploadResource } from "@/hooks/useUploadResource";
import { TTSProviderFactory } from "@/utils/tts";

export interface PodcastAudioResult {
  audioUrl: string;
  duration: number;
  lines: PodcastScriptLine[];
}

export async function synthesizePodcast(
  lines: PodcastScriptLine[],
  hooks: {
    signal: AbortSignal;
    onProgress: (done: number, total: number) => void;
    onPhase: (phase: string) => void;
  }
): Promise<PodcastAudioResult> {
  const synthesizer = TTSProviderFactory.getSpeechSynthesizer();
  if (!synthesizer) throw new Error("请先配置 TTS 服务提供商");

  const audioContext = new AudioContext();
  const segments: SpeechSegment[] = [];
  const timed = lines.map(line => ({ ...line }));
  let cursor = 0;

  for (let i = 0; i < timed.length; i++) {
    if (hooks.signal.aborted) throw new DOMException("已停止", "AbortError");
    try {
      const data = await synthesizer.synthesizeSpeech(timed[i].text, timed[i].voiceId);
      const segment = await loadSpeechSegment(audioContext, data);
      timed[i].startTime = cursor;
      timed[i].duration = segment.duration;
      cursor += segment.duration;
      segments.push(segment);
    } catch (error) {
      // 单句失败跳过，不中断整期
      console.error(`合成第 ${i + 1} 句失败:`, error);
    }
    hooks.onProgress(i + 1, timed.length);
  }
  if (segments.length === 0) throw new Error("没有成功合成任何语音");

  hooks.onPhase("合并音频");
  const merged = await mergeSpeechSegments(audioContext, segments);

  hooks.onPhase("上传音频");
  const audioUrl = await uploadResource(
    new File([merged.blob], `podcast_${Date.now()}.${merged.ext}`, {
      type: merged.blob.type || "audio/wav",
    })
  );
  if (!audioUrl) throw new Error("音频上传失败");

  return { audioUrl, duration: Math.floor(merged.duration), lines: timed };
}
