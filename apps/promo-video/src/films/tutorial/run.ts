/**
 * 把一章的脚本步骤排成时间轴：逐键重放进迷你编辑器，记下每一刻的文档快照、键帽、字幕、速查条与音效事件。
 * 时长由内容决定（打字节奏 + 停顿），章节之间首尾相接。纯 TS，音效导出脚本也读它。
 */
import {
  appendEmbed,
  caretAnchor,
  click,
  emptyDoc,
  isEditingSource,
  pressArrow,
  pressBackspace,
  pressEnter,
  pressEscape,
  pressTab,
  typeChar,
  type ClickTarget,
  type Doc,
  type EmbedKind,
} from "./model.ts";

export type Step =
  /** 换一条字幕（停留到下一条），并留出读字幕的时间 */
  | { cue: string; read?: number }
  | { wait: number }
  /** 打字：ASCII 逐字敲，中文按输入法上屏（2～3 字一组）；keys 让数字等也显示键帽 */
  | { type: string; keys?: boolean }
  /** 特殊键；slow 在触发前停更久，并给键帽加一圈强调；times 连按几次（菜单里上下移动） */
  | { key: "space" | "enter" | "up" | "down" | "left" | "right" | "undo" | "backspace" | "esc" | "tab"; slow?: boolean; times?: number }
  /** 用鼠标点一下（复选框、加标签、详情块的箭头…），光标从旁边移过来再按下 */
  | { click: ClickTarget }
  /** 文末出现一个嵌入块的成品样子（块的快闪） */
  | { embed: EmbedKind; hold?: number }
  /** 速查条加一条 */
  | { chip: { syntax: string; result: string } };

export type KeyCap = { at: number; label: string; trigger: boolean; slow: boolean };
export type Sfx = { t: number; kind: "key" | "space" | "enter" | "form" | "click" };
/** 一次点按：at 帧按下，hit 是画面里被点元素的 data-hit */
export type Click = { at: number; hit: string };
export type Snapshot = { at: number; doc: Doc; anchor: string };
export type Timed<T> = { at: number; value: T };

export type ChapterRun = {
  start: number;
  end: number;
  snapshots: Snapshot[];
  keys: KeyCap[];
  captions: Timed<string>[];
  chips: Timed<{ syntax: string; result: string }>[];
  clicks: Click[];
  sfx: Sfx[];
};

/** 节奏（帧，60fps）：记号逐个敲、正文按输入法上屏、触发前停一下、成型后留时间看清 */
const PACE = { mark: 11, ascii: 6, ime: 13, code: 4, enter: 18, nav: 14, beforeTrigger: 26, slowTrigger: 70, afterForm: 40, read: 70, cursor: 36, afterClick: 34 };
const KEY_CHARS = new Set([..."#>-*+`$~=_^|/"]);
const CJK = /[\p{Script=Han}，。、：；！？「」『』（）《》——…]/u;

/** 确定性的小抖动，让打字不像机器 */
const jitter = (n: number) => 0.8 + 0.4 * (Math.sin(n * 12.9898) * 43758.5453 - Math.floor(Math.sin(n * 12.9898) * 43758.5453));

/** 输入单元：中文按 2～3 字一组上屏，其余逐字 */
function units(text: string) {
  const out: { text: string; ime: boolean }[] = [];
  const chars = [...text];
  for (let i = 0; i < chars.length;) {
    if (CJK.test(chars[i])) {
      const size = 2 + (i % 2);
      let j = i;
      while (j < chars.length && j - i < size && CJK.test(chars[j])) j++;
      out.push({ text: chars.slice(i, j).join(""), ime: true });
      i = j;
    } else {
      out.push({ text: chars[i], ime: false });
      i++;
    }
  }
  return out;
}

const LABEL = { space: "空格", enter: "回车", up: "↑", down: "↓", left: "←", right: "→", undo: "⌘ Z", backspace: "⌫", esc: "Esc", tab: "Tab" } as const;

export function runChapter(steps: Step[], start: number): ChapterRun {
  let t = start;
  let n = 0;
  let doc = emptyDoc();
  const undo: Doc[] = [];
  const run: ChapterRun = { start, end: start, snapshots: [{ at: start, doc: structuredClone(doc), anchor: caretAnchor(doc) }], keys: [], captions: [], chips: [], clicks: [], sfx: [] };
  const snap = () => run.snapshots.push({ at: t, doc: structuredClone(doc), anchor: caretAnchor(doc) });

  /** 试敲一下看会不会转换：会的话先停顿，键帽标成触发键 */
  const press = (apply: (d: Doc, at: number) => { formed: boolean; undoPoint?: Doc }, opts: { gap: number; cap?: string; slow?: boolean; sfx: Sfx["kind"] }) => {
    const probe = structuredClone(doc);
    const formed = apply(probe, t + opts.gap).formed;
    t += opts.gap + (formed ? (opts.slow ? PACE.slowTrigger : PACE.beforeTrigger) : 0);
    const effect = apply(doc, t);
    if (effect.undoPoint) undo.push(effect.undoPoint);
    if (opts.cap) run.keys.push({ at: t, label: opts.cap, trigger: formed, slow: !!opts.slow });
    run.sfx.push({ t, kind: opts.sfx });
    if (formed) run.sfx.push({ t: t + 1, kind: "form" });
    snap();
    if (formed) t += PACE.afterForm;
  };

  for (const step of steps) {
    if ("cue" in step) {
      run.captions.push({ at: t, value: step.cue });
      t += step.read ?? PACE.read;
    } else if ("wait" in step) {
      t += step.wait;
    } else if ("chip" in step) {
      run.chips.push({ at: t, value: step.chip });
    } else if ("type" in step) {
      for (const unit of units(step.type)) {
        const source = isEditingSource(doc);
        const isKey = !unit.ime && !source && (KEY_CHARS.has(unit.text) || !!step.keys);
        const gap = Math.round((unit.ime ? PACE.ime : source ? PACE.code : isKey ? PACE.mark : PACE.ascii) * jitter(n++));
        if (unit.text === "\n") {
          press(pressEnter, { gap: PACE.enter, sfx: "enter" });
          continue;
        }
        press((d, at) => typeChar(d, unit.text, at), { gap, cap: isKey ? unit.text : undefined, sfx: unit.text === " " ? "space" : "key" });
      }
    } else if ("click" in step) {
      t += PACE.cursor;
      run.clicks.push({ at: t, hit: click(doc, step.click, t) });
      run.sfx.push({ t, kind: "click" });
      snap();
      t += PACE.afterClick;
    } else if ("embed" in step) {
      t += 10;
      appendEmbed(doc, step.embed, t);
      run.sfx.push({ t, kind: "form" });
      snap();
      t += step.hold ?? 80;
    } else if (step.key === "space") {
      press((d, at) => typeChar(d, " ", at), { gap: PACE.mark, cap: LABEL.space, slow: step.slow, sfx: "space" });
    } else if (step.key === "enter") {
      press(pressEnter, { gap: PACE.enter, cap: LABEL.enter, slow: step.slow, sfx: "enter" });
    } else if (step.key === "undo") {
      t += PACE.beforeTrigger;
      const previous = undo.pop();
      if (previous) doc = previous;
      run.keys.push({ at: t, label: LABEL.undo, trigger: true, slow: false });
      run.sfx.push({ t, kind: "key" });
      snap();
      t += PACE.afterForm;
    } else {
      // 方向键 / 退格 / Esc / Tab：菜单里连按得快；跳出代码块、表格后停一下
      const key = step.key;
      for (let i = 0; i < (step.times ?? 1); i++) {
        const inPanel = !!doc.panel;
        t += inPanel ? PACE.nav : PACE.enter;
        if (key === "backspace") pressBackspace(doc);
        else if (key === "esc") pressEscape(doc);
        else if (key === "tab") pressTab(doc);
        else pressArrow(doc, key);
        run.keys.push({ at: t, label: LABEL[key], trigger: false, slow: false });
        run.sfx.push({ t, kind: "key" });
        snap();
        if (!inPanel && key === "down") t += PACE.afterForm / 2;
      }
    }
  }
  run.end = t;
  return run;
}

/** frame 时刻的文档快照（最后一个 at ≤ frame 的） */
export function snapshotAt(run: ChapterRun, frame: number) {
  let lo = 0;
  let hi = run.snapshots.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (run.snapshots[mid].at <= frame) lo = mid;
    else hi = mid - 1;
  }
  return run.snapshots[lo];
}

/** 光标换行的时刻表：[{ at, anchor }]，镜头在相邻两行之间缓动 */
export function anchorChanges(run: ChapterRun) {
  const out: { at: number; anchor: string }[] = [];
  for (const s of run.snapshots) if (out.at(-1)?.anchor !== s.anchor) out.push({ at: s.at, anchor: s.anchor });
  return out;
}

/** frame 时刻最新的一条（字幕、速查条用） */
export function latest<T>(items: Timed<T>[], frame: number) {
  return items.findLast(item => item.at <= frame);
}
