/**
 * Qwen TTS adapter（主进程侧，阿里云百炼）。
 * 非流式 HTTP：POST {baseUrl}/api/v1/services/audio/tts/SpeechSynthesizer，
 * 响应 output.audio.url 为 24h 有效的音频文件地址，下载后以 Uint8Array 返回。
 * 音色列表 = 内置系统音色目录 + customization 接口拉取的复刻音色（失败降级为仅系统音色）。
 */
import type { TTSSynthesizeOptions, TTSVoice } from "@/types/tts";
import { ETTSProvider } from "@/types/tts";
import { DEFAULT_QWEN_TTS_BASE_URL, QWEN_TTS_SYSTEM_VOICES } from "@/utils/tts/catalog";

/** 交互式调用的超时上限：合成请求 60s、音频文件下载 120s，避免 UI 长时间挂起 */
const SYNTHESIZE_TIMEOUT_MS = 60_000;
const AUDIO_DOWNLOAD_TIMEOUT_MS = 120_000;

interface QwenRequestContext {
  apiKey: string;
  baseUrl?: string;
  model: string;
}

const apiBase = (baseUrl?: string) =>
  (baseUrl?.trim() || DEFAULT_QWEN_TTS_BASE_URL).replace(/\/$/, "");

interface QwenErrorResponse {
  code?: string;
  message?: string;
  request_id?: string;
}

async function requestQwen(
  ctx: Pick<QwenRequestContext, "apiKey" | "baseUrl">,
  path: string,
  body: unknown,
  timeoutMs = SYNTHESIZE_TIMEOUT_MS
): Promise<unknown> {
  let response: Response;
  let text: string;
  try {
    response = await fetch(`${apiBase(ctx.baseUrl)}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ctx.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    text = await response.text();
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      throw new Error("百炼服务响应超时，请稍后重试");
    }
    throw new Error(`连接百炼服务失败: ${error instanceof Error ? error.message : String(error)}`);
  }

  let data: unknown;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`百炼返回了非 JSON 响应 (${response.status}): ${text.slice(0, 200)}`);
  }

  if (!response.ok) {
    const err = data as QwenErrorResponse;
    throw new Error(
      `语音合成请求失败 (${response.status}): ${err.code ?? ""} ${err.message ?? text.slice(0, 200)}`.trim()
    );
  }
  if (
    typeof data === "object" &&
    data !== null &&
    "code" in data &&
    (data as QwenErrorResponse).code
  ) {
    const err = data as QwenErrorResponse;
    throw new Error(`语音合成失败: ${err.code} ${err.message ?? ""}`.trim());
  }
  return data;
}

export async function qwenSynthesize(
  ctx: QwenRequestContext,
  text: string,
  voiceId: string,
  options?: TTSSynthesizeOptions
): Promise<{ audio: Uint8Array; mime: string }> {
  // format/sample_rate 等可选字段与 text/voice 同在 input 下（官方 curl 示例结构）；
  // 标签控制由源头 prompt 分流负责（非 Minimax 提示词要求纯文本），adapter 不感知其他提供商的标签语法
  const input: Record<string, unknown> = {
    text,
    voice: voiceId,
    format: "mp3",
  };
  if (typeof options?.speed === "number" && options.speed > 0 && options.speed !== 1) {
    input.rate = Math.min(2, Math.max(0.5, options.speed));
  }
  if (typeof options?.volume === "number" && options.volume > 0) {
    // 接口 volume 为 0-100，接口层 volume 为 0-1 倍率，默认 50 对应 1.0
    input.volume = Math.round(Math.min(100, Math.max(0, options.volume * 50)));
  }
  if (typeof options?.pitch === "number" && options.pitch !== 0) {
    // 接口 pitch 为 0.5-2.0 倍率，接口层 pitch 以 0 为中心 ±偏移
    input.pitch = Math.min(2, Math.max(0.5, 1 + options.pitch));
  }

  const data = (await requestQwen(ctx, "/api/v1/services/audio/tts/SpeechSynthesizer", {
    model: ctx.model,
    input,
  })) as {
    output?: { audio?: { url?: string } };
  };

  const audioUrl = data.output?.audio?.url;
  if (!audioUrl) {
    throw new Error("百炼未返回音频地址（output.audio.url 缺失）");
  }

  let audioResponse: Response;
  try {
    audioResponse = await fetch(audioUrl, {
      signal: AbortSignal.timeout(AUDIO_DOWNLOAD_TIMEOUT_MS),
    });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      throw new Error("下载合成音频超时，请稍后重试");
    }
    throw new Error(`下载合成音频失败: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!audioResponse.ok) {
    throw new Error(`下载合成音频失败 (${audioResponse.status})`);
  }
  return {
    audio: new Uint8Array(await audioResponse.arrayBuffer()),
    mime: "audio/mpeg",
  };
}

export async function qwenGetVoiceList(ctx: QwenRequestContext): Promise<TTSVoice[]> {
  // 音色与模型版本绑定（_v3.1 只配 3.1 模型），系统音色按当前模型过滤
  const systemVoices: TTSVoice[] = QWEN_TTS_SYSTEM_VOICES.filter(voice =>
    voice.models.includes(ctx.model)
  ).map(voice => ({
    id: voice.voiceId,
    name: voice.name,
    description: voice.category,
    type: "system",
    provider: ETTSProvider.Qwen,
  }));

  let clonedVoices: TTSVoice[] = [];
  try {
    clonedVoices = await fetchQwenClonedVoices(ctx);
  } catch (error) {
    // 复刻音色拉取失败（未开通/网络问题）不阻塞系统音色展示
    console.warn("获取百炼复刻音色列表失败:", error);
  }

  return [...clonedVoices, ...systemVoices];
}

/** customization 接口的 list_voice：返回该账号通过声音复刻创建、且 target_model 匹配的音色 */
async function fetchQwenClonedVoices(ctx: QwenRequestContext): Promise<TTSVoice[]> {
  const voices: TTSVoice[] = [];
  const pageSize = 100;
  for (let pageIndex = 0; pageIndex < 10; pageIndex++) {
    const data = (await requestQwen(ctx, "/api/v1/services/audio/tts/customization", {
      model: "voice-enrollment",
      input: {
        action: "list_voice",
        page_size: pageSize,
        page_index: pageIndex,
      },
    })) as {
      output?: {
        voice_list?: Array<{
          voice_id?: string;
          status?: string;
          target_model?: string;
        }>;
      };
    };

    const list = data.output?.voice_list ?? [];
    voices.push(
      ...list
        .filter(
          item =>
            item.voice_id &&
            (!item.target_model || item.target_model === ctx.model) &&
            (!item.status || item.status === "OK")
        )
        .map(item => ({
          id: item.voice_id as string,
          name: item.voice_id as string,
          description: "复刻音色",
          type: "cloned" as const,
          provider: ETTSProvider.Qwen,
        }))
    );

    if (list.length < pageSize) {
      break;
    }
  }
  return voices;
}

/**
 * 创建复刻音色（voice-enrollment / create_voice）。
 * 参考音频须公网可访问——先做无认证 HEAD 预检，把"私有桶"这类问题挡在提交前
 * （否则百炼侧拉取失败只留一个 DEPLOYING 状态的哑音色）。
 */
export async function qwenCloneVoice(
  ctx: Omit<QwenRequestContext, "model">,
  targetModel: string,
  audioUrl: string,
  prefix: string
): Promise<string> {
  if (!/^[a-zA-Z0-9]{1,10}$/.test(prefix)) {
    throw new Error("音色前缀仅限字母/数字且不超过 10 个字符");
  }

  try {
    const check = await fetch(audioUrl, {
      method: "HEAD",
      signal: AbortSignal.timeout(15_000),
    });
    if (!check.ok) {
      throw new Error(`HEAD ${check.status}`);
    }
  } catch (error) {
    const reason =
      error instanceof Error && error.name === "TimeoutError"
        ? "访问超时"
        : error instanceof Error
          ? error.message
          : String(error);
    throw new Error(
      `参考音频 URL 无法公开访问（${reason}），请确认资源桶为公开读，否则百炼拉取不到音频`
    );
  }

  const data = (await requestQwen(ctx, "/api/v1/services/audio/tts/customization", {
    model: "voice-enrollment",
    input: {
      action: "create_voice",
      target_model: targetModel,
      url: audioUrl,
      prefix,
    },
  })) as {
    output?: { voice_id?: string };
  };

  if (!data.output?.voice_id) {
    throw new Error("百炼未返回音色 ID（复刻创建可能失败）");
  }
  return data.output.voice_id;
}
