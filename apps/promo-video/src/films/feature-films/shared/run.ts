/**
 * 功能片的回放引擎（仿教程片 films/tutorial/run.ts）：把一章的步骤脚本排成事件时间轴——字幕、点按、悬停、划选、键帽、打字进度、状态时刻、音效。
 * 时长由内容决定，章节之间首尾相接。纯 TS：音效导出脚本在 Node 里直接读它，不要引用 React 或 remotion。
 */
import { jitter, units, type Click, type KeyCap, type Sfx, type Timed } from "../../../kit/replay.ts";

export type Step =
  /** 换一条字幕（停留到下一条），并留出读字幕的时间 */
  | { cue: string; read?: number }
  | { wait: number }
  /** 鼠标点一下 data-hit 为该名字的元素：光标移过去、到了就按；as 把按下的帧号记成状态时刻 */
  | { click: string; as?: string }
  /** 鼠标移到 data-hit 为该名字的元素上停一下（hold 帧）：菜单项的高亮跟着它走；as 把到位的帧号记成状态时刻 */
  | { hover: string; as?: string; hold?: number }
  /** 按键：每个字符一枚键帽，最后一枚是触发键（如 "⌘⇧T"）；paste 在触发那一帧把整段文字贴进某个输入框；clear 是全选后替换前的清空；sound 换掉触发键的音色，false 整组按键不出声 */
  | { keys: string; as?: string; paste?: { input: string; text: string }; clear?: string; sound?: Sfx["kind"] | false }
  /** 划选：按住 data-hit 为 select-from:<名字> 的位置，拖到 select-to:<名字>，中间用 PACE.drag 帧 */
  | { drag: string; as?: string }
  /** 在此刻响一声（刻度弹出、截帧后的快门回声） */
  | { sfx: Sfx["kind"] }
  /** 往某个输入框打字：ASCII 逐字、中文按输入法上屏（2～3 字一组）；之后用 text(输入框) 取进度 */
  | { type: string; input: string; as?: string }
  /** 记一个状态时刻（解析完成、回答开始…），场景用 mark(名字) 取帧号；hold 是之后停顿的帧数 */
  | { mark: string; hold?: number }
  /** 圈出画面上刚发生变化的地方（data-hit 为该名字的元素），四周压淡，停 hold 帧让人看清 */
  | { spot: string; hold?: number }
  /** 等到第 at 帧（全片帧号）再往下走：按配乐排时间轴时用，前面的步骤演不完就报错 */
  | { at: number };

export type Typing = { input: string; start: number; end: number; /** 每个时刻的累计文本 */ commits: { at: number; text: string }[] };
/** 光标的一站：at 帧时在 hit 上；click 为真表示抵达时就按下 */
export type Stop = { at: number; hit: string; click?: boolean; /** 走到这一站用的帧数（划选的拖动） */ move?: number };

export type Replay = {
  start: number;
  end: number;
  captions: Timed<string>[];
  keys: KeyCap[];
  clicks: Click[];
  /** 每次划选：按下的帧号与松开的帧号 */
  drags: { hit: string; from: number; to: number }[];
  /** 光标的每一站（点按、悬停、划选的起终点），按时间排好；外壳用它连成光标的路径，场景用 under() 问光标停在哪 */
  stops: Stop[];
  typings: Typing[];
  marks: Record<string, number>;
  sfx: Sfx[];
  /** 圈出重点：每段从 from 帧到 to 帧 */
  spots: { hit: string; from: number; to: number }[];
};

/**
 * 节奏（帧，60fps）。一次点按 = 光标移过去 PACE.cursor 帧 + 在目标上停 PACE.settle 帧（让人看清要点哪）+ 按下后停 PACE.afterClick 帧，约 0.8 秒；
 * 操作的结果用 spot 圈出来停住，要让人看清的东西（确认框、解析结果）用步骤里的 wait 单独留时间。字幕出来后留 PACE.read 帧再动手。
 */
export const PACE = { ascii: 7, ime: 16, key: 12, afterKeys: 30, read: 40, cursor: 28, settle: 8, afterClick: 14, drag: 44, hover: 20, spot: 80 };

/** 一步从开始到「关键那一刻」（点按按下、划选按下、悬停到位、快捷键触发）要多少帧：想让这一刻落在拍上，就提前这么多帧开始 */
export function leadOf(step: Step) {
  if ("click" in step || "drag" in step) return PACE.cursor + PACE.settle;
  if ("hover" in step) return PACE.cursor;
  if ("keys" in step) return [...step.keys].length * PACE.key;
  return 0;
}

/** 不存在的时刻：progress 不接受 Infinity 和 NaN（产品片交接文档坑 3） */
export const NEVER = 1e9;

export function runSteps(steps: Step[], start: number): Replay {
  let t = start;
  let n = 0;
  const replay: Replay = { start, end: start, captions: [], keys: [], clicks: [], drags: [], stops: [], typings: [], marks: {}, sfx: [], spots: [] };
  const stop = (at: number, hit: string, click = false, move?: number) => replay.stops.push({ at, hit, click, move });
  const typingOf = (input: string) => {
    let typing = replay.typings.find(item => item.input === input);
    if (!typing) {
      typing = { input, start: t, end: t, commits: [{ at: start, text: "" }] };
      replay.typings.push(typing);
    }
    return typing;
  };
  const commit = (typing: Typing, text: string) => {
    typing.commits.push({ at: t, text });
    typing.end = t;
  };
  for (const step of steps) {
    if ("cue" in step) {
      replay.captions.push({ at: t, value: step.cue });
      t += step.read ?? PACE.read;
    } else if ("wait" in step) {
      t += step.wait;
    } else if ("click" in step) {
      t += PACE.cursor;
      stop(t, step.click);
      t += PACE.settle;
      stop(t, step.click, true);
      replay.clicks.push({ at: t, hit: step.click });
      replay.sfx.push({ t, kind: "click" });
      if (step.as) replay.marks[step.as] = t;
      t += PACE.afterClick;
    } else if ("hover" in step) {
      t += PACE.cursor;
      stop(t, step.hover);
      if (step.as) replay.marks[step.as] = t;
      t += step.hold ?? PACE.hover;
    } else if ("keys" in step) {
      const chars = [...step.keys];
      chars.forEach((char, i) => {
        const at = t + i * PACE.key;
        const trigger = i === chars.length - 1;
        replay.keys.push({ at, label: char, trigger, slow: false });
        if (!trigger && step.sound !== false) replay.sfx.push({ t: at, kind: "key" });
      });
      t += chars.length * PACE.key;
      if (chars.length && step.sound !== false) replay.sfx.push({ t, kind: step.sound ?? "enter" });
      if (step.clear) commit(typingOf(step.clear), "");
      if (step.paste) commit(typingOf(step.paste.input), step.paste.text);
      if (step.as) replay.marks[step.as] = t;
      t += PACE.afterKeys;
    } else if ("drag" in step) {
      t += PACE.cursor;
      stop(t, `select-from:${step.drag}`);
      t += PACE.settle;
      stop(t, `select-from:${step.drag}`, true);
      stop(t + PACE.drag, `select-to:${step.drag}`, false, PACE.drag);
      replay.drags.push({ hit: step.drag, from: t, to: t + PACE.drag });
      replay.sfx.push({ t, kind: "click" });
      if (step.as) replay.marks[step.as] = t;
      t += PACE.drag + PACE.afterClick;
    } else if ("sfx" in step) {
      replay.sfx.push({ t, kind: step.sfx });
    } else if ("type" in step) {
      const typing = typingOf(step.input);
      let text = typing.commits[typing.commits.length - 1].text;
      for (const unit of units(step.type)) {
        t += Math.round((unit.ime ? PACE.ime : PACE.ascii) * jitter(n++));
        text += unit.text;
        commit(typing, text);
        replay.sfx.push({ t, kind: "key" });
      }
      if (step.as) replay.marks[step.as] = t;
    } else if ("at" in step) {
      if (step.at < t) throw new Error(`步骤排不下：要在第 ${step.at} 帧到位，前面的步骤演到了第 ${t} 帧`);
      t = step.at;
    } else if ("spot" in step) {
      const hold = step.hold ?? PACE.spot;
      replay.spots.push({ hit: step.spot, from: t, to: t + hold });
      t += hold;
    } else {
      replay.marks[step.mark] = t;
      t += step.hold ?? 0;
    }
  }
  replay.end = t;
  return replay;
}

/** frame 时刻光标停在哪一个 data-hit 上（最后一个已经到的站）；动身去下一站的路上仍算停在这一站 */
export function under(replay: Replay, frame: number) {
  return replay.stops.findLast(stop => stop.at <= frame)?.hit;
}

/** 某个输入框在 frame 时刻已打出的字 */
export function typedText(replay: Replay, input: string, frame: number) {
  const typing = replay.typings.find(item => item.input === input);
  if (!typing) return "";
  let text = "";
  for (const commit of typing.commits) {
    if (commit.at > frame) break;
    text = commit.text;
  }
  return text;
}

/** 某个输入框在 frame 时刻是否正在打字（用来显示常亮的光标）；打完后还亮 hold 帧 */
export function isTyping(replay: Replay, input: string, frame: number, hold = 50) {
  const typing = replay.typings.find(item => item.input === input);
  if (!typing) return false;
  const last = typing.commits[typing.commits.length - 1].at;
  return frame >= typing.start && frame <= last + hold;
}

/** 状态时刻的帧号；没记过就当作永远不到 */
export const mark = (replay: Replay, name: string) => replay.marks[name] ?? NEVER;

/** frame 是否正处在对某个元素的点按里（按下态） */
export const pressing = (replay: Replay, hit: string, frame: number) => replay.clicks.some(click => click.hit === hit && frame >= click.at - 6 && frame < click.at + 5);

/** 入场 → 停留 → 退场：frame 在 [from, to) 内为 1，两端各用 fadeIn / fadeOut 帧过渡 */
export function span(frame: number, from: number, to: number, fadeIn = 10, fadeOut = 8) {
  if (from >= NEVER) return 0;
  const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
  return clamp01((frame - from) / fadeIn) * clamp01((to - frame) / fadeOut);
}

/** 0→1 的线性进度：frame 从 from 到 to */
export function ramp(frame: number, from: number, to: number) {
  if (from >= NEVER || to <= from) return frame >= to ? 1 : 0;
  return Math.max(0, Math.min(1, (frame - from) / (to - from)));
}
