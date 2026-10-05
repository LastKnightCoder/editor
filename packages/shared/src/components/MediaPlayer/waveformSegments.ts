/** 波形分段着色（如播客按说话人）：start / end 为 0 - 1 比例，tone 对应 tag 色板 */
export interface WaveformSegment {
  start: number;
  end: number;
  tone: 1 | 2 | 3 | 4 | 5;
}

/** 按柱子中点所在分段取色调；不落在任何分段（如段间静音）时返回 null */
export function segmentToneAt(segments: WaveformSegment[], ratio: number) {
  return segments.find(segment => ratio >= segment.start && ratio < segment.end)?.tone ?? null;
}
