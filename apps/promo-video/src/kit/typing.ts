/** 打字机：从 startAt 起每 perChar 帧多显示一个字；返回当前可见文本与是否打完 */
export function typed(text: string, frame: number, startAt: number, perChar = 4) {
  const count = Math.max(0, Math.min(text.length, Math.floor((frame - startAt) / perChar)));
  return { text: [...text].slice(0, count).join(""), done: count >= [...text].length, count };
}

/** 光标闪烁（每 32 帧一周期），打字中常亮 */
export function caretOn(frame: number, typing: boolean) {
  return typing || Math.floor(frame / 32) % 2 === 0;
}
