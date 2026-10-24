import { describe, expect, it, vi } from "vitest";
import {
  ASRTranscriptReducer,
  createASRTask,
  createASRStreamSession,
  MAC_NATIVE_ASR_DEFAULTS,
  type ASREventPayload,
  type ASRStreamDriver,
} from "./index";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const options = () => ({ taskId: "task", signal: new AbortController().signal, onEvent: vi.fn() });
const segment = (text: string, final = false) => ({ id: "sentence", text, final });
const frame = (seq = 0, data = new Uint8Array([1, 0])) => ({ seq, startSample: seq, data });
const driver = (): ASRStreamDriver => ({
  write: vi.fn(async () => undefined),
  finish: vi.fn(async () => ({ text: "尾句" })),
  dispose: vi.fn(async () => undefined),
});

describe("识别任务与分段", () => {
  it("最终汇总也不能改写已经交付的确认段", async () => {
    const task = createASRTask(options(), async (_signal, emit) => {
      emit({
        type: "segments",
        baseRevision: 0,
        revision: 1,
        startIndex: 0,
        deleteCount: 0,
        segments: [segment("已确认", true)],
      });
      return { text: "改写", segments: [segment("改写", true)] };
    });
    await expect(task.result).rejects.toMatchObject({ code: "protocol" });
  });
  it("取消等待清理，并拒绝取消后才到达的成功结果", async () => {
    const finished = deferred<{ text: string }>();
    const started = deferred<void>();
    const input = options();
    let publish!: (payload: ASREventPayload) => void;
    const task = createASRTask(input, async (_signal, emit) => {
      publish = emit;
      started.resolve();
      return finished.promise;
    });
    await started.promise;
    const cancelled = task.cancel();
    publish({ type: "progress", stage: "recognizing", message: "迟到" });
    expect(input.onEvent).not.toHaveBeenCalled();
    finished.resolve({ text: "不能提交" });
    await expect(task.result).rejects.toMatchObject({ code: "cancelled" });
    await cancelled;
  });
  it("任务完成后丢弃迟到事件，取消不撤销结果", async () => {
    const input = options();
    let publish!: (payload: ASREventPayload) => void;
    const task = createASRTask(input, async (_signal, emit) => {
      publish = emit;
      return { text: "已完成" };
    });
    await task.result;
    publish({ type: "progress", stage: "recognizing" });
    await task.cancel();
    expect(input.onEvent).not.toHaveBeenCalled();
    await expect(task.result).resolves.toEqual({ text: "已完成" });
  });
  it("预先取消不启动引擎", async () => {
    const controller = new AbortController();
    controller.abort();
    const execute = vi.fn();
    const task = createASRTask({ ...options(), signal: controller.signal }, execute);
    await expect(task.result).rejects.toMatchObject({ code: "cancelled" });
    expect(execute).not.toHaveBeenCalled();
  });
  it("同一句修订替换原文，确认后的段不允许改写", () => {
    const reducer = new ASRTranscriptReducer("task");
    const event = (seq: number, text: string, final = false) => ({
      taskId: "task",
      seq,
      type: "segments" as const,
      baseRevision: seq - 1,
      revision: seq,
      startIndex: 0,
      deleteCount: seq === 1 ? 0 : 1,
      segments: [segment(text, final)],
    });
    reducer.apply(event(1, "三点"));
    reducer.apply(event(2, "三点半", true));
    expect(reducer.getSnapshot().segments.map(s => s.text)).toEqual(["三点半"]);
    expect(reducer.apply(event(2, "重复包"))).toBe(false);
    expect(() => reducer.apply(event(3, "四点"))).toThrow("已确认");
  });
  it("拒绝错任务与事件缺口，不污染当前投影", () => {
    const reducer = new ASRTranscriptReducer("task");
    expect(() =>
      reducer.apply({ taskId: "other", seq: 1, type: "progress", stage: "recognizing" })
    ).toThrow("不属于");
    expect(() =>
      reducer.apply({ taskId: "task", seq: 2, type: "progress", stage: "recognizing" })
    ).toThrow("缺失");
    expect(reducer.getSnapshot()).toEqual({ revision: 0, segments: [] });
  });
  it("最终结果不得含临时段或倒置时间戳", async () => {
    await expect(
      createASRTask(options(), async () => ({ text: "未定", segments: [segment("未定")] })).result
    ).rejects.toMatchObject({ code: "protocol" });
    await expect(
      createASRTask(options(), async () => ({
        text: "时间",
        words: [{ text: "时间", startMs: 2, endMs: 1 }],
      })).result
    ).rejects.toMatchObject({ code: "protocol" });
  });
});

describe("PCM 输入、结束与尾句", () => {
  it("Mac 默认 medium VAD 和 16 kHz Int16，格式不合法时拒绝建会话", () => {
    expect(MAC_NATIVE_ASR_DEFAULTS.vad).toBe("medium");
    expect(MAC_NATIVE_ASR_DEFAULTS.format).toEqual({
      encoding: "pcm-s16le",
      sampleRateHz: 16000,
      channels: 1,
    });
    expect(() =>
      createASRStreamSession(
        options(),
        { encoding: "pcm-s16le", sampleRateHz: NaN, channels: 1 },
        async () => driver()
      )
    ).toThrow("PCM");
  });
  it("排空尾帧后才结束输入，最终结果等待尾句而不提前完成", async () => {
    const write = deferred<void>();
    const tail = deferred<{ text: string }>();
    const backend = driver();
    backend.write = vi.fn(() => write.promise);
    backend.finish = vi.fn(() => tail.promise);
    const session = createASRStreamSession(
      options(),
      MAC_NATIVE_ASR_DEFAULTS.format,
      async () => backend
    );
    const data = new Uint8Array([1, 0]);
    const sent = session.write(frame(0, data));
    data[0] = 99;
    const stop = session.endInput();
    const repeated = session.endInput();
    await vi.waitFor(() => expect(backend.write).toHaveBeenCalled());
    expect(vi.mocked(backend.write).mock.calls[0][0].data[0]).toBe(1);
    expect(backend.finish).not.toHaveBeenCalled();
    write.resolve();
    await sent;
    await stop;
    await repeated;
    await vi.waitFor(() => expect(backend.finish).toHaveBeenCalledTimes(1));
    await expect(session.write(frame(1))).rejects.toThrow("停止接收");
    expect(backend.dispose).not.toHaveBeenCalled();
    tail.resolve({ text: "春夏秋冬雨" });
    await expect(session.result).resolves.toEqual({ text: "春夏秋冬雨" });
    expect(backend.dispose).toHaveBeenCalledTimes(1);
  });
  it("取消可以赢过停止后等待，迟到尾句不得变为成功", async () => {
    const tail = deferred<{ text: string }>();
    const backend = driver();
    backend.finish = vi.fn(() => tail.promise);
    const session = createASRStreamSession(
      options(),
      MAC_NATIVE_ASR_DEFAULTS.format,
      async () => backend
    );
    await session.endInput();
    await vi.waitFor(() => expect(backend.finish).toHaveBeenCalled());
    await session.cancel();
    tail.resolve({ text: "迟到" });
    await expect(session.result).rejects.toMatchObject({ code: "cancelled" });
    expect(backend.dispose).toHaveBeenCalledTimes(1);
  });
  it("未返回尾句时超时并回收连接", async () => {
    const backend = driver();
    backend.finish = () => new Promise(() => undefined);
    const session = createASRStreamSession(
      options(),
      MAC_NATIVE_ASR_DEFAULTS.format,
      async () => backend,
      { maxBufferedMs: 100, tailTimeoutMs: 20 }
    );
    await session.endInput();
    await expect(session.result).rejects.toMatchObject({ code: "timeout" });
    expect(backend.dispose).toHaveBeenCalledTimes(1);
  });
  it("预取消和不连续帧均不会悬挂", async () => {
    const controller = new AbortController();
    controller.abort();
    const connect = vi.fn(async () => driver());
    const first = createASRStreamSession(
      { ...options(), signal: controller.signal },
      MAC_NATIVE_ASR_DEFAULTS.format,
      connect
    );
    await expect(first.result).rejects.toMatchObject({ code: "cancelled" });
    expect(connect).not.toHaveBeenCalled();
    const next = createASRStreamSession(options(), MAC_NATIVE_ASR_DEFAULTS.format, async () =>
      driver()
    );
    await expect(next.write(frame(9))).rejects.toMatchObject({ code: "invalid-input" });
    await expect(next.result).rejects.toMatchObject({ code: "invalid-input" });
  });
  it("慢发送队列有界，溢出会终止任务", async () => {
    const backend = driver();
    backend.write = () => new Promise(() => undefined);
    const session = createASRStreamSession(
      options(),
      MAC_NATIVE_ASR_DEFAULTS.format,
      async () => backend,
      { maxBufferedMs: 1, tailTimeoutMs: 100 }
    );
    const pending = session.write(frame(0, new Uint8Array(32)));
    void pending.catch(() => undefined);
    await expect(
      session.write({ seq: 1, startSample: 16, data: new Uint8Array(2) })
    ).rejects.toMatchObject({ code: "busy" });
    await expect(session.result).rejects.toMatchObject({ code: "busy" });
    await expect(pending).rejects.toBeDefined();
  });
  it("连接建立中也能取消，迟到连接仍会被释放", async () => {
    const connecting = deferred<ASRStreamDriver>();
    const backend = driver();
    const connect = vi.fn(() => connecting.promise);
    const session = createASRStreamSession(options(), MAC_NATIVE_ASR_DEFAULTS.format, connect);
    await vi.waitFor(() => expect(connect).toHaveBeenCalled());
    await session.cancel();
    await expect(session.result).rejects.toMatchObject({ code: "cancelled" });
    connecting.resolve(backend);
    await vi.waitFor(() => expect(backend.dispose).toHaveBeenCalledTimes(1));
  });
});
