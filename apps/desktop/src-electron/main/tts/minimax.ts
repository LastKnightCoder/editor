/**
 * Minimax TTS adapter（主进程侧）。
 * 请求构造 / hex 解码 / 错误映射 / 限流重试移植自渲染端 src/services/minimax.ts
 * （synthesizeSpeech 部分），网络出口收敛到主进程：无 CORS 约束、可统一加代理。
 */
import type { TTSSynthesizeOptions, TTSVoice } from "@/types/tts";
import { ETTSProvider } from "@/types/tts";
import type { MinimaxSpeechModel, MinimaxVoice } from "@/types/minimax";
import { normalizeMinimaxSpeechText } from "@/utils/tts/minimaxSpeech";
import { DEFAULT_MINIMAX_TTS_BASE_URL } from "@/utils/tts/catalog";

interface MinimaxRequestContext {
  apiKey: string;
  baseUrl?: string;
  model: string;
}

const apiBase = (baseUrl?: string) =>
  (baseUrl?.trim() || DEFAULT_MINIMAX_TTS_BASE_URL).replace(/\/$/, "");

/** 交互式调用的超时上限，避免 UI 长时间挂起 */
const SYNTHESIZE_TIMEOUT_MS = 120_000;
const VOICE_LIST_TIMEOUT_MS = 30_000;

/** 永久性失败（无效 Key/参数错误等），重试无意义 */
class PermanentTtsError extends Error {}

export async function minimaxSynthesize(
  ctx: MinimaxRequestContext,
  text: string,
  voiceId: string,
  options?: TTSSynthesizeOptions,
  maxRetries = 3
): Promise<{ audio: Uint8Array; mime: string }> {
  const normalizedText = normalizeMinimaxSpeechText(text, ctx.model as MinimaxSpeechModel);

  const requestBody = {
    model: ctx.model,
    text: normalizedText,
    stream: false,
    voice_setting: {
      voice_id: voiceId,
      speed: options?.speed ?? 1.1,
      vol: options?.volume ?? 1.0,
      pitch: options?.pitch ?? 0,
    },
    audio_setting: {
      sample_rate: 32000,
      bitrate: 128000,
      format: "mp3",
      channel: 1,
    },
    subtitle_enable: false,
  };

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(`${apiBase(ctx.baseUrl)}/v1/t2a_v2`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${ctx.apiKey}`,
        },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(SYNTHESIZE_TIMEOUT_MS),
      });

      if (!response.ok) {
        const errorText = await response.text();
        // 5xx/429 是网关瞬时故障（与码表 1024/1033/1002 同语义），退避后重试；
        // 其余 4xx（鉴权/参数类）为永久失败
        if ((response.status >= 500 || response.status === 429) && attempt < maxRetries) {
          const delay = calculateRetryDelay(attempt, response.status === 429 ? 1002 : 1024);
          console.warn(
            `语音合成失败 (HTTP ${response.status})，${delay}ms 后重试 (${attempt + 1}/${maxRetries})`
          );
          await sleep(delay);
          continue;
        }
        throw new PermanentTtsError(`语音合成失败 (${response.status}): ${errorText}`);
      }

      const data = (await response.json()) as {
        base_resp: { status_code: number; status_msg: string };
        data: { audio: string };
      };

      if (data.base_resp.status_code !== 0) {
        const errorCode = data.base_resp.status_code;
        const errorMsg = data.base_resp.status_msg;

        if (shouldRetryError(errorCode) && attempt < maxRetries) {
          const delay = calculateRetryDelay(attempt, errorCode);
          console.warn(
            `语音合成失败 (错误码: ${errorCode}): ${errorMsg}，${delay}ms 后重试 (${attempt + 1}/${maxRetries})`
          );
          await sleep(delay);
          continue;
        }

        throw new PermanentTtsError(getErrorMessage(errorCode, errorMsg));
      }

      const hexString = data.data.audio;
      const bytes = new Uint8Array(hexString.length / 2);
      for (let i = 0; i < hexString.length; i += 2) {
        bytes[i / 2] = parseInt(hexString.substring(i, i + 2), 16);
      }

      return { audio: bytes, mime: "audio/mpeg" };
    } catch (error) {
      lastError = error as Error;

      // 已判定的永久性失败（无效 Key/参数错误/余额不足等）重试无意义，直接抛出
      if (error instanceof PermanentTtsError) {
        throw error;
      }
      if (error instanceof Error && error.name === "TimeoutError") {
        throw new Error("Minimax 服务响应超时，请稍后重试");
      }

      if (attempt < maxRetries && isNetworkError(error)) {
        const delay = calculateRetryDelay(attempt, 1001);
        console.warn(
          `网络错误: ${lastError.message}，${delay}ms 后重试 (${attempt + 1}/${maxRetries})`
        );
        await sleep(delay);
        continue;
      }

      if (attempt >= maxRetries) {
        break;
      }

      // 未归类错误（响应解析失败等）无重试依据，直接抛出原始错误
      throw lastError;
    }
  }

  throw lastError || new Error("语音合成失败");
}

export async function minimaxGetVoiceList(ctx: {
  apiKey: string;
  baseUrl?: string;
}): Promise<TTSVoice[]> {
  let response: Response;
  try {
    response = await fetch(`${apiBase(ctx.baseUrl)}/v1/get_voice`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ctx.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ voice_type: "all" }),
      signal: AbortSignal.timeout(VOICE_LIST_TIMEOUT_MS),
    });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      throw new Error("获取 Minimax 音色列表超时，请稍后重试");
    }
    throw new Error(
      `连接 Minimax 服务失败: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`获取音色列表失败 (${response.status}): ${errorText}`);
  }

  const data = (await response.json()) as {
    base_resp: { status_code: number; status_msg: string };
    voice_cloning?: MinimaxVoice[];
    voice_generation?: MinimaxVoice[];
    system_voice?: MinimaxVoice[];
  };

  if (data.base_resp.status_code !== 0) {
    throw new Error(`获取音色列表失败: ${data.base_resp.status_msg}`);
  }

  const allVoices: MinimaxVoice[] = [
    ...(data.voice_cloning ?? []).map(voice => ({
      ...voice,
      voice_type: "voice_cloning" as const,
    })),
    ...(data.voice_generation ?? []).map(voice => ({
      ...voice,
      voice_type: "voice_generation" as const,
    })),
    ...(data.system_voice ?? []).map(voice => ({ ...voice, voice_type: "system_voice" as const })),
  ];

  return allVoices.map(voice => {
    let type: TTSVoice["type"] = "system";
    if (voice.voice_type === "voice_cloning") {
      type = "cloned";
    } else if (voice.voice_type === "voice_generation") {
      type = "custom";
    }
    return {
      id: voice.voice_id,
      name: voice.voice_name || voice.voice_id,
      description: voice.description?.join(", "),
      type,
      provider: ETTSProvider.Minimax,
    };
  });
}

/** 判断错误码是否应该重试 */
function shouldRetryError(errorCode: number): boolean {
  const retryableCodes = [
    1000, // 未知错误/系统默认错误
    1001, // 请求超时
    1002, // 请求频率超限
    1024, // 内部错误
    1033, // 系统错误/下游服务错误
    2045, // 请求频率增长超限
  ];
  return retryableCodes.includes(errorCode);
}

/** 计算重试延迟（指数退避 + 抖动）；限流类错误用更长基础延迟 */
function calculateRetryDelay(attempt: number, errorCode: number): number {
  const baseDelay = errorCode === 1002 || errorCode === 2045 ? 3000 : 1000;
  const exponentialDelay = baseDelay * Math.pow(2, attempt);
  const jitter = exponentialDelay * 0.2 * (Math.random() - 0.5);
  return Math.min(exponentialDelay + jitter, 30000);
}

function isNetworkError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return message.includes("network") || message.includes("timeout") || message.includes("fetch");
  }
  return false;
}

/** 根据错误码返回友好的错误信息 */
function getErrorMessage(errorCode: number, originalMsg: string): string {
  const errorMessages: Record<number, string> = {
    1000: "系统错误，请稍后再试",
    1001: "请求超时，请稍后再试",
    1002: "请求频率超限（每分钟最多 20 次），请稍后再试",
    1004: "API Key 无效或未授权，请检查您的 API Key",
    1008: "账户余额不足，请充值后重试",
    1024: "内部错误，请稍后再试",
    1026: "输入内容涉敏，请调整输入内容",
    1027: "输出内容涉敏，请调整输入内容",
    1033: "下游服务错误，请稍后再试",
    1039: "Token 限制，请调整 max_tokens",
    1041: "连接数限制，请联系客服",
    1042: "输入包含过多不可见字符或非法字符，请检查输入内容",
    1043: "ASR 相似度检查失败，请检查 file_id 与 text_validation 匹配度",
    1044: "克隆提示词相似度检查失败，请检查克隆提示音频和提示词",
    2013: "参数错误，请检查请求参数",
    20132: "voice_id 参数错误，请检查 voice_id 参数",
    2037: "语音时长不符合要求（10秒-5分钟），请调整语音时长",
    2038: "语音克隆功能被禁用，请完成账户身份认证",
    2039: "voice_id 重复，请使用不同的 voice_id",
    2042: "无权访问该 voice_id，请确认是否为创建者",
    2045: "请求频率增长超限，请避免请求骤增骤减",
    2048: "语音克隆提示音频太长（需 <8s），请调整音频时长",
    2049: "无效的 API Key，请检查 API Key",
  };

  return errorMessages[errorCode] || `语音合成失败 (错误码: ${errorCode}): ${originalMsg}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
