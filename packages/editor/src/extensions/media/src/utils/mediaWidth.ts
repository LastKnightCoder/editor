/** 媒体块宽度预设：占编辑区可用宽度的比例（属性条按钮与拖动吸附共用） */
export const WIDTH_PRESETS = [0.5, 0.75, 1] as const;

/** 拖动缩放时距预设多近（占可用宽度的比例）就吸附 */
export const WIDTH_SNAP_TOLERANCE = 0.02;

/** 编辑区内容宽度（扣除编辑器左右内边距），媒体块能占的最大宽度 */
export function editorContentWidth(el: HTMLElement | null | undefined): number {
  const editorEl = el?.closest<HTMLElement>('[data-slate-editor="true"]');
  if (!editorEl) return 0;
  const style = getComputedStyle(editorEl);
  return (
    editorEl.clientWidth -
    (parseFloat(style.paddingLeft) || 0) -
    (parseFloat(style.paddingRight) || 0)
  );
}

/** 当前宽度命中的预设（容差 2px），不在预设上返回 null */
export function matchWidthPreset(width: number | undefined, available: number): number | null {
  if (width == null || available <= 0) return null;
  return WIDTH_PRESETS.find(ratio => Math.abs(available * ratio - width) <= 2) ?? null;
}

/** 按预设吸附：离某个预设足够近就吸过去，返回吸附后的宽度与命中的预设 */
export function snapWidth(
  width: number,
  available: number
): { width: number; preset: number | null } {
  if (available <= 0) return { width, preset: null };
  for (const ratio of WIDTH_PRESETS) {
    if (Math.abs(width / available - ratio) <= WIDTH_SNAP_TOLERANCE) {
      return { width: available * ratio, preset: ratio };
    }
  }
  return { width, preset: null };
}
