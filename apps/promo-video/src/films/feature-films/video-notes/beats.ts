/**
 * 视频笔记宣传版的节拍网格：配乐 Cat Walk（129.2 BPM，一小节约 1.86 秒）。n 是曲内小节 / 拍序号，影片从曲内第 START_BAR 小节开始，
 * bar(n) / beat(n) 返回影片帧号，n 可带小数（半拍、四分之一拍）。曲内第 CUT.from–CUT.to 小节剪掉不放，之后的小节号照旧按曲内算。
 * 纯 TS：音效导出脚本也读它。
 */
import { TRACKS } from "../../../brand/music.ts";
import { leadOf, type Step } from "../shared/run.ts";
import { FPS } from "../shared/timeline.ts";

const TRACK = TRACKS.catWalk;
/** 节拍表里第 PHASE 拍是第 0 小节的第一拍（逐小节响度跳变最整齐的相位） */
const PHASE = 2;
const BEAT_LEN = 60 / TRACK.bpm;

const wholeBeat = (n: number) => {
  const i = n + PHASE;
  const beats = TRACK.beats;
  return i < beats.length ? beats[i] : beats[beats.length - 1] + (i - beats.length + 1) * BEAT_LEN;
};

const trackBeat = (n: number) => {
  const i = Math.floor(n);
  return wholeBeat(i) + (wholeBeat(i + 1) - wholeBeat(i)) * (n - i);
};

/** 影片 0 帧是曲内第 START_BAR 小节第一拍：前奏只留两小节给片头宣言 */
export const START_BAR = 5;
/** 配乐从曲内第几秒开始放 */
export const MUSIC_START = trackBeat(START_BAR * 4);

/**
 * 剪掉的小节：爆发段第 n 和 n+4 小节几乎一样，剪掉第 17–20 小节后，第 16 小节接第 21 小节听起来就像原曲的第 20 接第 21。
 * 第 22 小节的过门留着，停拍前的收束不突兀
 */
const CUT = { from: 17, to: 21 };
const inCut = (n: number) => n >= CUT.from * 4 && n < CUT.to * 4;
const CUT_SEC = trackBeat(CUT.to * 4) - trackBeat(CUT.from * 4);

/** 第 n 拍（小节 m 的第 k 拍 = m * 4 + k）在影片里的帧号 */
export function beat(n: number) {
  if (inCut(n)) throw new Error(`第 ${n} 拍在剪掉的第 ${CUT.from}–${CUT.to} 小节里`);
  return Math.round((trackBeat(n) - MUSIC_START - (n >= CUT.to * 4 ? CUT_SEC : 0)) * FPS);
}
export const bar = (n: number) => beat(n * 4);

/** 配乐分两段放：from 为影片帧号，startAt 为曲内秒数 */
export const MUSIC_CLIPS = [
  { from: 0, startAt: MUSIC_START },
  { from: beat(CUT.to * 4), startAt: trackBeat(CUT.to * 4) },
];

/** 让这一步的关键那一刻（按下、触发）正好落在 frame 上 */
export const onBeat = (frame: number, step: Step): Step[] => [{ at: frame - leadOf(step) }, step];

/** from 之后到 frame 为止过了几拍，带上这一拍里的进度（在拍点后 pop 帧内从 0 到 1）：用来让东西一拍出一个 */
export function beatsSince(from: number, frame: number, pop = 8, step = 1) {
  let n = START_BAR * 4;
  const next = (k: number) => {
    let m = k + step;
    while (inCut(m)) m += step;
    return m;
  };
  while (inCut(n) || beat(n) < from) n = next(n);
  let count = 0;
  let last = n;
  while (beat(n) <= frame) {
    count++;
    last = n;
    n = next(n);
  }
  if (!count) return 0;
  return count - 1 + Math.min(1, (frame - beat(last)) / pop);
}
