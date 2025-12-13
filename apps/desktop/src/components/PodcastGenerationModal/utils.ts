// 格式化时间 (秒 -> mm:ss)
export function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

// 规范化时长范围
export function normalizeDurationRange(min: number, max: number): [number, number] {
  const clamp = (value: number) => {
    if (Number.isNaN(value)) return 1;
    return Math.min(15, Math.max(1, Math.round(value)));
  };
  const a = clamp(min);
  const b = clamp(max);
  return a <= b ? [a, b] : [b, a];
}

// 阶段名称映射
export const stageNames: Record<string, string> = {
  parsing: "解析内容",
  script: "生成脚本",
  tts: "合成语音",
  music: "生成音乐",
  merging: "合并音频",
  upload: "上传音频",
  complete: "完成",
};
