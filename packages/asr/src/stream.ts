import { ASRError, asrAbortError, throwIfASRAborted, waitForASR } from "./errors";
import { createASRTask } from "./task";
import type {
  ASRAudioFormat,
  ASRAudioFrame,
  ASREventPayload,
  ASRRunOptions,
  ASRStreamSession,
  ASRTranscript,
} from "./types";

export function validateASRAudioFormat(format: ASRAudioFormat): void {
  if (
    format.encoding !== "pcm-s16le" ||
    format.channels !== 1 ||
    !Number.isSafeInteger(format.sampleRateHz) ||
    format.sampleRateHz <= 0
  )
    throw new ASRError("invalid-input", "识别音频必须为协商采样率的单声道 PCM Int16");
}
export interface ASRStreamDriver {
  write(frame: ASRAudioFrame, signal: AbortSignal): Promise<void>;
  finish(signal: AbortSignal, emit: (event: ASREventPayload) => void): Promise<ASRTranscript>;
  dispose(): Promise<void>;
}

/** 驱动可在 write 中交付实时事件；finish 发送结束标记并等待最终结果。 */
export function createASRStreamSession(
  options: ASRRunOptions,
  format: ASRAudioFormat,
  connect: (
    signal: AbortSignal,
    emit: (event: ASREventPayload) => void
  ) => Promise<ASRStreamDriver>,
  limits = { maxBufferedMs: 2000, tailTimeoutMs: 10000 }
): ASRStreamSession {
  validateASRAudioFormat(format);
  if (
    !Number.isFinite(limits.maxBufferedMs) ||
    limits.maxBufferedMs <= 0 ||
    !Number.isFinite(limits.tailTimeoutMs) ||
    limits.tailTimeoutMs <= 0
  )
    throw new ASRError("invalid-input", "识别队列与尾句期限必须为有限正数");
  const lifetime = new AbortController();
  const externalAbort = () => lifetime.abort(asrAbortError());
  options.signal.addEventListener("abort", externalAbort, { once: true });
  if (options.signal.aborted) externalAbort();
  let end!: () => void;
  const ended = new Promise<void>(resolve => {
    end = resolve;
  });
  lifetime.signal.addEventListener("abort", end, { once: true });
  let driverReady!: (driver: ASRStreamDriver) => void;
  let driverFailed!: (error: unknown) => void;
  const ready = new Promise<ASRStreamDriver>((resolve, reject) => {
    driverReady = resolve;
    driverFailed = reject;
  });
  void ready.catch(() => undefined);
  let accepting = true;
  let queuedBytes = 0;
  let sequence = 0;
  let sample = 0;
  let queue: Promise<void> = Promise.resolve();
  let failure: unknown;
  let tailTimer: ReturnType<typeof setTimeout> | undefined;
  const fail = (error: unknown) => {
    failure ??= error;
    accepting = false;
    lifetime.abort(asrAbortError());
    end();
  };
  const task = createASRTask({ ...options, signal: lifetime.signal }, async (signal, emit) => {
    let driver: ASRStreamDriver | undefined;
    let disposed = false;
    const dispose = async (value: ASRStreamDriver) => {
      if (disposed) return;
      disposed = true;
      await value.dispose();
    };
    try {
      const connecting = connect(signal, emit);
      void connecting
        .then(value => {
          if (signal.aborted) return dispose(value);
        })
        .catch(() => undefined);
      driver = await waitForASR(connecting, signal);
      driverReady(driver);
      throwIfASRAborted(signal);
      await waitForASR(ended, signal);
      await waitForASR(queue, signal);
      throwIfASRAborted(signal);
      return await waitForASR(driver.finish(signal, emit), signal);
    } catch (error) {
      driverFailed(error);
      throw error;
    } finally {
      accepting = false;
      if (tailTimer) clearTimeout(tailTimer);
      if (driver) await dispose(driver);
    }
  });
  const result = task.result
    .catch(error => {
      throw failure ?? error;
    })
    .finally(() => {
      accepting = false;
      if (tailTimer) clearTimeout(tailTimer);
      driverFailed(asrAbortError());
      options.signal.removeEventListener("abort", externalAbort);
      lifetime.signal.removeEventListener("abort", end);
    });
  void result.catch(() => undefined);
  const rejectWrite = (error: unknown) => {
    fail(error);
    return Promise.reject(error);
  };
  return {
    result,
    write(frame) {
      if (!accepting || lifetime.signal.aborted)
        return Promise.reject(new ASRError("invalid-input", "识别会话已停止接收音频"));
      if (
        frame.seq !== sequence ||
        frame.startSample !== sample ||
        !(frame.data instanceof Uint8Array) ||
        frame.data.byteLength === 0 ||
        frame.data.byteLength % 2 !== 0
      )
        return rejectWrite(new ASRError("invalid-input", "音频帧序号、样本位置或 PCM 字节无效"));
      if (
        queuedBytes + frame.data.byteLength >
        (format.sampleRateHz * 2 * limits.maxBufferedMs) / 1000
      )
        return rejectWrite(new ASRError("busy", "识别发送队列已满"));
      const copy = { ...frame, data: frame.data.slice() };
      sequence++;
      sample += copy.data.byteLength / 2;
      queuedBytes += copy.data.byteLength;
      const write = queue
        .then(async () => {
          const driver = await waitForASR(ready, lifetime.signal);
          throwIfASRAborted(lifetime.signal);
          await waitForASR(driver.write(copy, lifetime.signal), lifetime.signal);
        })
        .finally(() => {
          queuedBytes -= copy.data.byteLength;
        });
      queue = write;
      void write.catch(fail);
      return write;
    },
    endInput() {
      if (accepting) {
        accepting = false;
        tailTimer = setTimeout(
          () => fail(new ASRError("timeout", "等待识别尾句超时")),
          limits.tailTimeoutMs
        );
        end();
      }
      return queue;
    },
    async cancel() {
      accepting = false;
      lifetime.abort(asrAbortError());
      end();
      await task.cancel();
    },
  };
}
