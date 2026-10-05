import type { PodcastScriptLine, PodcastSpeaker } from "@/types/podcast";

export type SpeakerTone = 1 | 2 | 3 | 4 | 5;

const TONE_COUNT = 5;

/** 说话人 → tag 色调：按 speakers 声明顺序分配，脚本里出现但未声明的说话人顺延 */
export function buildSpeakerTones(
  speakers: PodcastSpeaker[],
  lines: PodcastScriptLine[]
): Map<string, SpeakerTone> {
  const tones = new Map<string, SpeakerTone>();
  const assign = (name: string) => {
    if (!tones.has(name)) {
      tones.set(name, ((tones.size % TONE_COUNT) + 1) as SpeakerTone);
    }
  };
  speakers.forEach(speaker => assign(speaker.name));
  lines.forEach(line => assign(line.speaker));
  return tones;
}

/** 每句台词对应的波形分段（秒） */
export function buildSpeakerSegments(
  lines: PodcastScriptLine[],
  tones: Map<string, SpeakerTone>
): { start: number; end: number; tone: SpeakerTone }[] {
  return lines
    .filter(line => line.duration > 0)
    .map(line => ({
      start: line.startTime,
      end: line.startTime + line.duration,
      tone: tones.get(line.speaker) ?? 1,
    }));
}

/** 当前播放到的台词下标：最后一句开始时间不晚于 time 的；尚未到第一句时返回 0 */
export function findCurrentLineIndex(lines: PodcastScriptLine[], time: number): number {
  let current = 0;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startTime <= time) {
      current = i;
    } else {
      break;
    }
  }
  return current;
}
