import { describe, expect, it } from "vitest";
import { SpeakerRole, type PodcastScriptLine, type PodcastSpeaker } from "@/types/podcast";
import { buildSpeakerSegments, buildSpeakerTones, findCurrentLineIndex } from "../speakers";

const speaker = (name: string): PodcastSpeaker => ({
  name,
  voiceId: name,
  voiceName: name,
  role: SpeakerRole.Host,
});

const line = (name: string, startTime: number, duration: number): PodcastScriptLine => ({
  speaker: name,
  text: `${name} 的台词`,
  voiceId: name,
  startTime,
  duration,
});

const lines = [line("小林", 0, 10), line("阿哲", 10, 5), line("小林", 15, 0), line("路人", 15, 4)];

describe("播客说话人", () => {
  it("按声明顺序分配色调，脚本里未声明的说话人顺延", () => {
    const tones = buildSpeakerTones([speaker("阿哲"), speaker("小林")], lines);
    expect([...tones.entries()]).toEqual([
      ["阿哲", 1],
      ["小林", 2],
      ["路人", 3],
    ]);
  });

  it("分段跳过零时长的句子", () => {
    const tones = buildSpeakerTones([], lines);
    expect(buildSpeakerSegments(lines, tones)).toEqual([
      { start: 0, end: 10, tone: 1 },
      { start: 10, end: 15, tone: 2 },
      { start: 15, end: 19, tone: 3 },
    ]);
  });

  it("当前句为最后一句已开始的台词", () => {
    expect(findCurrentLineIndex(lines, 0)).toBe(0);
    expect(findCurrentLineIndex(lines, 9.9)).toBe(0);
    expect(findCurrentLineIndex(lines, 12)).toBe(1);
    expect(findCurrentLineIndex(lines, 100)).toBe(3);
    expect(findCurrentLineIndex([], 3)).toBe(0);
  });
});
