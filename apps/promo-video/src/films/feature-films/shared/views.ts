/**
 * 功能片共用的机位：窗口坐标里对准画面中心的点（见 timeline.ts 的 View），窗口是 1760×990。
 * 整窗（FULL）以外的都是特写：窗口的边被切掉是正常的，但要点的东西必须在画里，底部 120px 留给字幕条。
 * 视频笔记的版面（文档树收起时）：左栏 x 238–1081（播放器 y 102–616，字幕 y 660–970），右栏笔记 x 1082–1744。
 */
import type { View } from "./timeline.ts";
import { FEATURE_WINDOW } from "../../../mock/videonote.ts";

/** 整窗 */
export const FULL: View = { x: FEATURE_WINDOW.width / 2, y: FEATURE_WINDOW.height / 2, zoom: 1 };
/** 插件中心（特写）：右上角的搜索框和左上那张卡片都在画里 */
export const PLUGINS: View = { x: 960, y: 400, zoom: 1.25 };
/** 项目页：整窗略放大，左边的文档树和「+」菜单都在画里 */
export const PROJECT: View = { x: 760, y: 440, zoom: 1.12 };
/** 弹窗特写：解析视频、选清晰度的时候推近，看得清选项 */
export const DIALOG: View = { x: 880, y: 470, zoom: 1.5 };
/** 播放器特写：整张幻灯片和控制条都在画里（片头、截帧前讲到示意图） */
export const HOOK: View = { x: 660, y: 390, zoom: 1.6 };
/** 记笔记 · 看的一侧：播放器下半、字幕和笔记栏的左边 */
export const NOTE_LEFT: View = { x: 720, y: 590, zoom: 1.4 };
/** 记笔记 · 记的一侧：播放器的进度条刻度和整栏笔记 */
export const NOTE_RIGHT: View = { x: 1070, y: 470, zoom: 1.4 };
/** 截帧：播放器和整栏笔记同框，看得见这一帧从画面飞进笔记 */
export const SHOT: View = { x: 990, y: 450, zoom: 1.12 };
/** 截帧落地后：推近笔记里的这张图 */
export const SHOT_NOTE: View = { x: 1330, y: 560, zoom: 1.5 };
/** 点回那一刻：播放器（进度条和刻度）与笔记里的时间戳同框 */
export const SEEK: View = { x: 990, y: 440, zoom: 1.2 };
/** 问 AI：对话停靠成第三栏后，字幕的右半、笔记和对话栏同框。输入框贴着窗口底边（y≈975），要整个落在字幕条（画面 y 930 以下）上面 */
export const ASK: View = { x: 1020, y: 665, zoom: 1.25 };
/** AI 导出电子书的弹窗（880 宽）：底栏按钮要在字幕条上面 */
export const EBOOK: View = { x: 880, y: 520, zoom: 1.15 };

/** 导出后访达里选中这本书（访达窗口在窗口正中，980×560） */
export const FINDER: View = { x: 880, y: 520, zoom: 1.4 };

/** 一串镜头关键帧：先停在起始机位，每到一站写「何时开始走、走到哪」；开始走之前的上一站一直停着。换机位用 48 帧 */
export function cameraPath(start: View, stops: [leaveAt: number, view: View][], move = 48) {
  const keys: (View & { at: number })[] = [{ at: 0, ...start }];
  let view = start;
  for (const [leaveAt, next] of stops) {
    if (next === view) continue;
    keys.push({ at: leaveAt, ...view }, { at: leaveAt + move, ...next });
    view = next;
  }
  return keys;
}
