import { ASRError, asrAbortError, throwIfASRAborted } from "./errors";
import { ASRTranscriptReducer, validateTranscript } from "./reducer";
import type { ASREventPayload, ASRRunOptions, ASRTask, ASRTranscript } from "./types";

export function createASRTask<T extends ASRTranscript>(
  options: ASRRunOptions,
  execute: (signal: AbortSignal, emit: (payload: ASREventPayload) => void) => Promise<T>
): ASRTask<T> {
  const controller = new AbortController();
  const reducer = new ASRTranscriptReducer(options.taskId);
  let settled = false;
  let seq = 0;
  const abort = () => {
    if (!settled) controller.abort(asrAbortError());
  };
  options.signal.addEventListener("abort", abort, { once: true });
  if (options.signal.aborted) abort();
  const result = Promise.resolve().then(async () => {
    try {
      throwIfASRAborted(controller.signal);
      const value = await execute(controller.signal, payload => {
        if (settled || controller.signal.aborted) return;
        const event = { ...payload, taskId: options.taskId, seq: ++seq };
        reducer.apply(event);
        options.onEvent(event);
      });
      throwIfASRAborted(controller.signal);
      validateTranscript(value);
      for (const confirmed of reducer.getSnapshot().segments.filter(segment => segment.final)) {
        const delivered = value.segments?.find(segment => segment.id === confirmed.id);
        if (
          !delivered ||
          delivered.text !== confirmed.text ||
          delivered.final !== confirmed.final ||
          delivered.startMs !== confirmed.startMs ||
          delivered.endMs !== confirmed.endMs ||
          delivered.speakerId !== confirmed.speakerId
        ) {
          throw new ASRError("protocol", "最终结果改写或遗漏了已确认分段");
        }
      }
      return value;
    } catch (error) {
      throwIfASRAborted(controller.signal);
      throw error;
    } finally {
      settled = true;
      options.signal.removeEventListener("abort", abort);
    }
  });
  // 调用方稍后订阅 result 时仍能取得原错误，创建期间不产生未处理拒绝。
  void result.catch(() => undefined);
  return {
    result,
    cancel: async () => {
      abort();
      await result.catch(() => undefined);
    },
  };
}
