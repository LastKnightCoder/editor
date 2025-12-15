import type {
  MinimaxVoice,
  MinimaxVoiceListRequest,
  MinimaxVoiceListResponse,
  MinimaxFileUploadResponse,
  MinimaxVoiceCloneRequest,
  MinimaxVoiceCloneResponse,
  MinimaxTTSRequest,
  MinimaxTTSResponse,
} from "@/types/minimax";

const MINIMAX_API_BASE = "https://api.minimaxi.com";

/**
 * 获取音色列表
 * 参考文档：https://platform.minimaxi.com/docs/api-reference/voice-management-get
 */
export async function getVoiceList(apiKey: string): Promise<MinimaxVoice[]> {
  try {
    const requestBody: MinimaxVoiceListRequest = {
      voice_type: "all",
    };

    const response = await fetch(`${MINIMAX_API_BASE}/v1/get_voice`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`获取音色列表失败 (${response.status}): ${errorText}`);
    }

    const data: MinimaxVoiceListResponse = await response.json();

    // 检查响应状态
    if (data.base_resp.status_code !== 0) {
      throw new Error(`获取音色列表失败: ${data.base_resp.status_msg}`);
    }

    // 合并所有类型的音色并标记类型
    const allVoices: MinimaxVoice[] = [];

    if (data.voice_cloning) {
      allVoices.push(
        ...data.voice_cloning.map((voice) => ({
          ...voice,
          voice_type: "voice_cloning" as const,
        }))
      );
    }

    if (data.voice_generation) {
      allVoices.push(
        ...data.voice_generation.map((voice) => ({
          ...voice,
          voice_type: "voice_generation" as const,
        }))
      );
    }

    if (data.system_voice) {
      allVoices.push(
        ...data.system_voice.map((voice) => ({
          ...voice,
          voice_type: "system_voice" as const,
        }))
      );
    }

    return allVoices;
  } catch (error) {
    console.error("获取音色列表失败:", error);
    throw error;
  }
}

/**
 * 上传参考音频文件
 * 参考文档：https://platform.minimaxi.com/docs/api-reference/voice-cloning-uploadcloneaudio
 */
export async function uploadReferenceAudio(file: File, apiKey: string): Promise<string> {
  try {
    // 验证文件
    const maxSize = 20 * 1024 * 1024; // 20MB
    if (file.size > maxSize) {
      throw new Error("文件大小不能超过 20MB");
    }

    const allowedTypes = ["audio/mpeg", "audio/mp4", "audio/x-m4a", "audio/wav"];
    if (!allowedTypes.includes(file.type)) {
      throw new Error("仅支持 mp3, m4a, wav 格式");
    }

    // 创建 FormData
    const formData = new FormData();
    formData.append("file", file);
    formData.append("purpose", "voice_clone");

    const response = await fetch(`${MINIMAX_API_BASE}/v1/files/upload`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`上传音频失败 (${response.status}): ${errorText}`);
    }

    const data: MinimaxFileUploadResponse = await response.json();

    // 检查响应状态
    if (data.base_resp.status_code !== 0) {
      throw new Error(`上传音频失败: ${data.base_resp.status_msg}`);
    }

    return data.file.file_id;
  } catch (error) {
    console.error("上传参考音频失败:", error);
    throw error;
  }
}

/**
 * 快速克隆音色
 * 参考文档：https://platform.minimaxi.com/docs/api-reference/voice-cloning-clone
 */
export async function cloneVoice(fileId: string, voiceId: string, apiKey: string): Promise<void> {
  try {
    // 验证 voice_id 格式
    if (!voiceId || voiceId.trim().length === 0) {
      throw new Error("voice_id 不能为空");
    }

    if (voiceId.length > 100) {
      throw new Error("voice_id 长度不能超过 100 个字符");
    }

    const requestBody: MinimaxVoiceCloneRequest = {
      file_id: fileId,
      voice_id: voiceId.trim(),
    };

    const response = await fetch(`${MINIMAX_API_BASE}/v1/voice_clone`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`克隆音色失败 (${response.status}): ${errorText}`);
    }

    const data: MinimaxVoiceCloneResponse = await response.json();

    // 检查响应状态
    if (data.base_resp.status_code !== 0) {
      const errorCode = data.base_resp.status_code;
      const errorMsg = data.base_resp.status_msg;

      // 根据错误码提供友好提示
      if (errorCode === 2037) {
        throw new Error("音频时长不符合要求（需 10秒-5分钟），请调整音频时长");
      } else if (errorCode === 2038) {
        throw new Error("语音克隆功能被禁用，请先完成账户身份认证");
      } else if (errorCode === 2039) {
        throw new Error("voice_id 已存在，请使用不同的 voice_id");
      } else if (errorCode === 1043) {
        throw new Error("音频质量不符合要求，请使用清晰的单人音频");
      }

      throw new Error(`克隆音色失败 (错误码: ${errorCode}): ${errorMsg}`);
    }
  } catch (error) {
    console.error("克隆音色失败:", error);
    throw error;
  }
}

/**
 * 合成语音（带重试机制）
 * 参考文档：
 * - https://platform.minimaxi.com/docs/api-reference/speech-t2a-http
 * - https://platform.minimaxi.com/docs/api-reference/errorcode
 */
export async function synthesizeSpeech(
  text: string,
  voiceId: string,
  apiKey: string,
  maxRetries = 3
): Promise<ArrayBuffer> {
  const requestBody: MinimaxTTSRequest = {
    model: "speech-2.6-hd",
    text,
    stream: false,
    voice_setting: {
      voice_id: voiceId,
      speed: 1.1,
      vol: 1.0,
      pitch: 0,
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
      const response = await fetch(`${MINIMAX_API_BASE}/v1/t2a_v2`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`语音合成失败 (${response.status}): ${errorText}`);
      }

      const data: MinimaxTTSResponse = await response.json();

      // 检查响应状态码
      if (data.base_resp.status_code !== 0) {
        const errorCode = data.base_resp.status_code;
        const errorMsg = data.base_resp.status_msg;

        // 根据错误码决定是否重试
        const shouldRetry = shouldRetryError(errorCode);

        if (shouldRetry && attempt < maxRetries) {
          // 计算重试延迟（指数退避）
          const delay = calculateRetryDelay(attempt, errorCode);
          console.warn(
            `语音合成失败 (错误码: ${errorCode}): ${errorMsg}，${delay}ms 后重试 (${attempt + 1}/${maxRetries})`
          );
          await sleep(delay);
          continue;
        }

        // 不重试或已达最大重试次数，抛出详细错误
        throw new Error(getErrorMessage(errorCode, errorMsg));
      }

      // 将 hex 编码的音频数据转换为 ArrayBuffer
      const hexString = data.data.audio;
      const bytes = new Uint8Array(hexString.length / 2);
      for (let i = 0; i < hexString.length; i += 2) {
        bytes[i / 2] = parseInt(hexString.substring(i, i + 2), 16);
      }

      return bytes.buffer;
    } catch (error) {
      lastError = error as Error;

      // 如果是网络错误或超时，也尝试重试
      if (attempt < maxRetries && isNetworkError(error)) {
        const delay = calculateRetryDelay(attempt, 1001);
        console.warn(
          `网络错误: ${lastError.message}，${delay}ms 后重试 (${attempt + 1}/${maxRetries})`
        );
        await sleep(delay);
        continue;
      }

      // 如果已达最大重试次数，抛出错误
      if (attempt >= maxRetries) {
        break;
      }
    }
  }

  throw lastError || new Error("语音合成失败");
}

/**
 * 判断错误码是否应该重试
 */
function shouldRetryError(errorCode: number): boolean {
  const retryableCodes = [
    1000, // 未知错误/系统默认错误
    1001, // 请求超时
    1002, // 请求频率超限（重要！需要重试）
    1024, // 内部错误
    1033, // 系统错误/下游服务错误
    2045, // 请求频率增长超限
  ];
  return retryableCodes.includes(errorCode);
}

/**
 * 计算重试延迟（指数退避 + 抖动）
 */
function calculateRetryDelay(attempt: number, errorCode: number): number {
  // 对于频率限制错误 (1002, 2045)，使用更长的延迟
  const baseDelay = errorCode === 1002 || errorCode === 2045 ? 3000 : 1000;

  // 指数退避: baseDelay * 2^attempt
  const exponentialDelay = baseDelay * Math.pow(2, attempt);

  // 添加随机抖动 (±20%)
  const jitter = exponentialDelay * 0.2 * (Math.random() - 0.5);

  return Math.min(exponentialDelay + jitter, 30000); // 最大 30 秒
}

/**
 * 判断是否为网络错误
 */
function isNetworkError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return message.includes("network") || message.includes("timeout") || message.includes("fetch");
  }
  return false;
}

/**
 * 根据错误码返回友好的错误信息
 * 参考：https://platform.minimaxi.com/docs/api-reference/errorcode
 */
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
    2037: "语音时长不符合要求（10秒-5分钟），请调整音频时长",
    2038: "语音克隆功能被禁用，请完成账户身份认证",
    2039: "voice_id 重复，请使用不同的 voice_id",
    2042: "无权访问该 voice_id，请确认是否为创建者",
    2045: "请求频率增长超限，请避免请求骤增骤减",
    2048: "语音克隆提示音频太长（需 <8s），请调整音频时长",
    2049: "无效的 API Key，请检查 API Key",
  };

  return errorMessages[errorCode] || `语音合成失败 (错误码: ${errorCode}): ${originalMsg}`;
}

/**
 * 延迟函数
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
