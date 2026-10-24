import { ASRError } from "./errors";
import type { ASREvent, ASRSegment, ASRTranscript } from "./types";

const validTime = (value: number) => Number.isFinite(value) && value >= 0;
function validateRange(start?: number, end?: number) {
  if (
    (start !== undefined && !validTime(start)) ||
    (end !== undefined && !validTime(end)) ||
    (start !== undefined && end !== undefined && end < start)
  )
    throw new ASRError("protocol", "识别时间戳无效");
}
function validateSegments(segments: readonly ASRSegment[]) {
  const ids = new Set<string>();
  for (const segment of segments) {
    if (
      !segment.id ||
      ids.has(segment.id) ||
      typeof segment.text !== "string" ||
      typeof segment.final !== "boolean"
    )
      throw new ASRError("protocol", "识别分段身份或内容无效");
    ids.add(segment.id);
    validateRange(segment.startMs, segment.endMs);
  }
}
export function validateTranscript(result: ASRTranscript): void {
  if (typeof result.text !== "string") throw new ASRError("protocol", "识别结果缺少文本");
  validateSegments(result.segments ?? []);
  if (result.segments?.some(segment => !segment.final))
    throw new ASRError("protocol", "最终结果包含未确认分段");
  for (const word of result.words ?? []) {
    if (typeof word.text !== "string" || !validTime(word.startMs) || !validTime(word.endMs))
      throw new ASRError("protocol", "词级识别结果无效");
    validateRange(word.startMs, word.endMs);
  }
  if (result.durationMs !== undefined && !validTime(result.durationMs))
    throw new ASRError("protocol", "音频时长无效");
}
export class ASRTranscriptReducer {
  private seq = 0;
  private revision = 0;
  private segments: readonly ASRSegment[] = [];
  constructor(private readonly taskId: string) {}
  getSnapshot() {
    return { revision: this.revision, segments: this.segments };
  }
  apply(event: ASREvent): boolean {
    if (event.taskId !== this.taskId) throw new ASRError("protocol", "识别事件不属于当前任务");
    if (!Number.isSafeInteger(event.seq) || event.seq < 1)
      throw new ASRError("protocol", "识别事件序号无效");
    if (event.seq <= this.seq) return false;
    if (event.seq !== this.seq + 1) throw new ASRError("protocol", "识别事件缺失或乱序");
    if (event.type === "segments") {
      if (
        event.baseRevision !== this.revision ||
        event.revision !== this.revision + 1 ||
        !Number.isSafeInteger(event.startIndex) ||
        !Number.isSafeInteger(event.deleteCount) ||
        event.startIndex < 0 ||
        event.deleteCount < 0 ||
        event.startIndex + event.deleteCount > this.segments.length
      )
        throw new ASRError("protocol", "识别文本修订不连续或范围无效");
      if (
        this.segments
          .slice(event.startIndex, event.startIndex + event.deleteCount)
          .some(segment => segment.final)
      )
        throw new ASRError("protocol", "已确认分段不能被改写");
      const next = [...this.segments];
      next.splice(
        event.startIndex,
        event.deleteCount,
        ...event.segments.map(segment => Object.freeze({ ...segment }))
      );
      validateSegments(next);
      this.segments = Object.freeze(next);
      this.revision = event.revision;
    } else if (event.fraction !== undefined && (!validTime(event.fraction) || event.fraction > 1)) {
      throw new ASRError("protocol", "识别进度无效");
    }
    this.seq = event.seq;
    return true;
  }
}
