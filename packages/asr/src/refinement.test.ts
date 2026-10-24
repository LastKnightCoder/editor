import { afterEach, expect, it, vi } from "vitest";
import {
  refineSpeechInput,
  validateSpeechRefinementPreferences,
  type SpeechRefiner,
} from "./refinement";
const transcript = {
  text: "明天 开会 开会",
  segments: [{ id: "a", text: "明天 开会 开会", final: true, startMs: 0, endMs: 500 }],
  language: "zh-CN",
};
const options = () => ({ signal: new AbortController().signal, onPreview: vi.fn() });
afterEach(() => vi.useRealTimers());
it("未选模型和静音不调用模型，原始结果独立保留", async () => {
  const raw = await refineSpeechInput(transcript, undefined, options());
  expect(raw).toEqual({ original: transcript, text: transcript.text, status: "original" });
  expect(raw.original).not.toBe(transcript);
  const refine = vi.fn(async () => "虚构");
  expect((await refineSpeechInput({ text: "" }, refine, options())).status).toBe("original");
  expect(refine).not.toHaveBeenCalled();
});
it("整理与时间轴分开，预览不是最终结果，收尾后丢弃迟到更新", async () => {
  const run = options();
  let emit!: (text: string) => void;
  const result = await refineSpeechInput(
    transcript,
    async (_text, options) => {
      emit = options.onPreview;
      emit("临时");
      return "明天开会。";
    },
    run
  );
  expect(result.text).toBe("明天开会。");
  expect(result.original).toEqual(transcript);
  expect(result.status).toBe("refined");
  emit("迟到");
  expect(run.onPreview).toHaveBeenCalledExactlyOnceWith("临时");
});
for (const [name, refine] of [
  [
    "异常",
    async () => {
      throw new Error("敏感错误详情");
    },
  ],
  ["空正文", async () => " \n"],
] as [string, SpeechRefiner][])
  it(`${name}仅回退原文，不交付半成品`, async () => {
    expect(await refineSpeechInput(transcript, refine, options())).toEqual({
      original: transcript,
      text: transcript.text,
      status: "fallback",
    });
  });
it("超时终止底层请求并回退原文", async () => {
  vi.useFakeTimers();
  let signal!: AbortSignal;
  const result = refineSpeechInput(
    transcript,
    async (_text, options) => {
      signal = options.signal;
      return new Promise(() => {});
    },
    options(),
    100
  );
  await vi.advanceTimersByTimeAsync(100);
  expect(signal.aborted).toBe(true);
  expect((await result).status).toBe("fallback");
});
it("用户取消不是失败降级，不返回原文或迟到模型结果", async () => {
  const controller = new AbortController();
  let resolve!: (value: string) => void;
  let signal!: AbortSignal;
  const result = refineSpeechInput(
    transcript,
    async (_text, options) => {
      signal = options.signal;
      return new Promise(done => {
        resolve = done;
      });
    },
    { ...options(), signal: controller.signal }
  );
  const rejected = expect(result).rejects.toThrow();
  await Promise.resolve();
  controller.abort();
  await rejected;
  expect(signal.aborted).toBe(true);
  resolve("迟到");
});
it("录音前已取消不调用模型", async () => {
  const controller = new AbortController();
  controller.abort();
  const refine = vi.fn(async () => "正文");
  await expect(
    refineSpeechInput(transcript, refine, { ...options(), signal: controller.signal })
  ).rejects.toThrow();
  expect(refine).not.toHaveBeenCalled();
});
it("整理偏好只接受明确风格与有界文本", () => {
  expect(
    validateSpeechRefinementPreferences({ style: "light", instructions: "  保留缩写  " })
  ).toEqual({ style: "light", instructions: "保留缩写" });
  for (const value of [
    null,
    { style: "invent", instructions: "" },
    { style: "light", instructions: "字".repeat(1001) },
  ])
    expect(() => validateSpeechRefinementPreferences(value)).toThrow();
});
