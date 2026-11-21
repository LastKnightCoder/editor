import { groupTimedWords } from "../subtitle-cues";
import type { TranscriptionSegment } from "../whisper-engine";

export function nativeSubtitles(raw: unknown, text: string, duration: number) {
  if (!Array.isArray(raw)) throw new Error("Qwen 逐词时间格式无效");
  const durationMs = Math.round(duration * 1000);
  const words: TranscriptionSegment[] = raw.map(item => {
    if (
      !item ||
      typeof item.word !== "string" ||
      !Number.isSafeInteger(item.start_sample) ||
      !Number.isSafeInteger(item.end_sample) ||
      item.start_sample < 0 ||
      item.end_sample < item.start_sample
    )
      throw new Error("Qwen 逐词时间无效");
    // ffmpeg 将输入统一为 16 kHz，原生接口返回采样点。
    return {
      text: item.word,
      start: Math.min(durationMs, Math.round(item.start_sample / 16)),
      end: Math.min(durationMs, Math.round(item.end_sample / 16)),
    };
  });
  if (text && !words.length) throw new Error("Qwen 未返回可用的字幕时间轴");
  // 对齐词不含标点。以原文的词间内容恢复断句和中英混排空格。
  const positions: number[] = [];
  let offset = 0;
  const punctuation = /^[\s\p{P}\p{S}]*$/u;
  for (const word of words) {
    const index = text.indexOf(word.text, offset);
    if (!word.text || index < 0 || !punctuation.test(text.slice(offset, index))) break;
    positions.push(index);
    offset = index + word.text.length;
  }
  const matched = words.length === positions.length && punctuation.test(text.slice(offset));
  const cues = matched
    ? words.map((word, i) => ({
        ...word,
        text: text.slice(i === 0 ? 0 : positions[i], positions[i + 1] ?? text.length),
      }))
    : words;
  const separator =
    matched || /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(text) ? "" : " ";
  return { segments: groupTimedWords(cues, separator), wordSegments: words };
}
