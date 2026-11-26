import type { TranscriptionProgress } from "../../../shared/media-progress";
import { TranscriptionService, type TranscriptionOptions } from "./whisper-engine";
import { groupTimedWords } from "./subtitle-cues";
import { transcribeQwen } from "./qwen/engine";

export class LocalTranscriptionService extends TranscriptionService {
  override async transcribe(
    audio: string,
    options: TranscriptionOptions = {},
    progress?: (progress: TranscriptionProgress) => void,
    signal = new AbortController().signal
  ) {
    if (options.engine === "qwen")
      return transcribeQwen(this.getModelsDir(), audio, options, signal, progress);
    const result = await super.transcribe(audio, options, progress, signal);
    if (options.output === "text") return { ...result, segments: [], wordSegments: undefined };
    if (options.output === "subtitles" && !result.segments.length && result.wordSegments) {
      result.segments = groupTimedWords(
        result.wordSegments,
        /^(zh|ja|yue)/.test(result.language) ? "" : " "
      );
      result.text = result.segments.map(cue => cue.text).join("\n");
    }
    return result;
  }
}
