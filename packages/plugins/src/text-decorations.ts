import type { PluginContentLocation } from "./app";
import type { Disposable } from "./contract";

export interface PluginDecorationSource {
  readonly kind: "card" | "article" | "document";
  readonly id: string;
}

export interface PluginDecorationBlock {
  readonly source: PluginDecorationSource;
  readonly blockType: string;
  readonly text: string;
}

/**
 * 外观按打扰程度从低到高：
 * - `dot`：文字不变，末尾一个小圆点
 * - `ghost`：静止时点线极淡，悬停或按住 ⌘/Ctrl 才显出
 * - `reference`：正文色文字 + 点线，悬停变实线
 * - `tint`：只改字色
 * - `marker`：下沿荧光笔底色
 * - `wavy`：波浪下划线，适合提醒或待确认
 *
 * `dot`、`ghost`、`reference` 表示可以点击，必须提供 `key` 和 `onActivate`。
 */
export type PluginTextDecorationAppearance =
  | "reference"
  | "ghost"
  | "marker"
  | "tint"
  | "wavy"
  | "dot";

/** 主题里的语义色，深浅主题由宿主适配。 */
export type PluginTextDecorationTone = "accent" | "info" | "warn" | "muted";

export interface PluginTextDecoration {
  /** 当前连续文本内的 UTF-16 偏移，左闭右开。 */
  start: number;
  end: number;
  appearance: PluginTextDecorationAppearance;
  /** 默认 `accent`。 */
  tone?: PluginTextDecorationTone;
  /** 有 key 的结果可以触发 onActivate。 */
  key?: string;
  /** 悬停提示，例如「打开文章《遗忘曲线》」。 */
  label?: string;
}

/** onActivate 返回候选时，宿主在文字旁弹出菜单让用户选择。 */
export interface PluginTextDecorationCandidate {
  key: string;
  title: string;
  description?: string;
}

export interface PluginTextDecorationActivation {
  key: string;
  source: PluginDecorationSource;
  /** 用户在候选菜单里选中的 `candidate.key`；首次点击时为空。 */
  choice?: string;
}

export interface PluginDecorationPreviewTarget {
  ref: PluginDecorationSource;
  at?: PluginContentLocation;
}

export interface PluginTextDecorationProvider {
  sources: readonly PluginDecorationSource["kind"][];
  getDecorations(
    block: PluginDecorationBlock,
    signal: AbortSignal
  ): readonly PluginTextDecoration[] | Promise<readonly PluginTextDecoration[]>;
  /** 停留在命中或候选上时解析目标；宿主负责授权检查和只读预览。 */
  getPreview?(
    hit: PluginTextDecorationActivation,
    signal: AbortSignal
  ): PluginDecorationPreviewTarget | undefined | Promise<PluginDecorationPreviewTarget | undefined>;
  onActivate?(
    action: PluginTextDecorationActivation
  ):
    | void
    | readonly PluginTextDecorationCandidate[]
    | Promise<void | readonly PluginTextDecorationCandidate[]>;
}

export interface PluginTextDecorationHandle extends Disposable {
  invalidate(scope?: { source: PluginDecorationSource }): void;
}

export interface PluginTextDecorations {
  register(provider: PluginTextDecorationProvider): Promise<PluginTextDecorationHandle>;
}
