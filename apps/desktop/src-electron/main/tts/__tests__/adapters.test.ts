/**
 * TTS 主进程 adapter 消融测试基线：重试控制流、音色模型过滤、hex 解码。
 * 这些用例与二轮评审的修复一一对应，撤销对应修复应使相关用例变红（消融验证见提交说明）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ETTSProvider } from "@/types/tts";
import { minimaxSynthesize } from "../../tts/minimax";
import { qwenGetVoiceList } from "../../tts/qwen";

const minimaxOkResponse = (hex: string) =>
  new Response(
    JSON.stringify({
      base_resp: { status_code: 0, status_msg: "" },
      data: { audio: hex, status: 2 },
    }),
    { status: 200 }
  );

const minimaxErrorResponse = (statusCode: number) =>
  new Response(
    JSON.stringify({
      base_resp: { status_code: statusCode, status_msg: "mock" },
      data: { audio: "", status: 0 },
    }),
    { status: 200 }
  );

const bytesToHex = (bytes: number[]) =>
  bytes.map(byte => byte.toString(16).padStart(2, "0")).join("");

describe("tts/minimax adapter 重试控制流", () => {
  const ctx = { apiKey: "k", model: "speech-2.8-hd" };

  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("永久性业务错误（无效 Key 1004）只请求一次，不重试", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(minimaxErrorResponse(1004));

    await expect(minimaxSynthesize(ctx, "你好", "v1")).rejects.toThrow("API Key 无效或未授权");
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it("网关瞬时错误（HTTP 500）按退避重试，恢复后成功", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(new Response("bad gateway", { status: 500 }))
      .mockResolvedValueOnce(minimaxOkResponse(bytesToHex([0x00, 0xff, 0x10])));

    const result = await minimaxSynthesize(ctx, "你好", "v1");
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    expect(Array.from(result.audio)).toEqual([0x00, 0xff, 0x10]);
  });

  it("网络错误重试后仍失败，抛出最后一次错误", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new TypeError("fetch failed"));

    await expect(minimaxSynthesize(ctx, "你好", "v1", undefined, 2)).rejects.toThrow(
      "fetch failed"
    );
    // 2 次重试 + 首次 = 3 次
    expect(globalThis.fetch).toHaveBeenCalledTimes(3);
  });

  it("hex 音频解码正确", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      minimaxOkResponse(bytesToHex([0x48, 0x65, 0x6c, 0x6c, 0x6f]))
    );

    const result = await minimaxSynthesize(ctx, "你好", "v1");
    expect(new TextDecoder().decode(result.audio)).toBe("Hello");
    expect(result.mime).toBe("audio/mpeg");
  });
});

describe("tts/qwen adapter 音色模型过滤", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            output: {
              voice_list: [
                {
                  voice_id: "qwen-audio-3.1-tts-flash-myvoice-ab12",
                  status: "OK",
                  target_model: "qwen-audio-3.1-tts-flash",
                },
              ],
            },
          })
        )
      )
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("3.1 模型：返回匹配的复刻音色与内置系统音色", async () => {
    const voices = await qwenGetVoiceList({
      apiKey: "k",
      model: "qwen-audio-3.1-tts-flash",
    });

    const cloned = voices.filter(voice => voice.type === "cloned");
    const system = voices.filter(voice => voice.type === "system");
    expect(cloned.map(voice => voice.id)).toContain("qwen-audio-3.1-tts-flash-myvoice-ab12");
    expect(system.length).toBeGreaterThan(0);
    expect(system.every(voice => voice.id.endsWith("_v3.1"))).toBe(true);
    expect(system.every(voice => voice.provider === ETTSProvider.Qwen)).toBe(true);
  });

  it("非 3.1 模型（如手动添加的 3.0）：系统音色被过滤为空，仅剩匹配的复刻音色", async () => {
    const voices = await qwenGetVoiceList({
      apiKey: "k",
      model: "qwen-audio-3.0-tts-plus",
    });

    expect(voices.filter(voice => voice.type === "system")).toEqual([]);
    // target_model 不匹配 3.0 的复刻音色也被过滤
    expect(voices).toEqual([]);
  });
});
