import type {
  MinimaxFileUploadResponse,
  MinimaxVoiceCloneRequest,
  MinimaxVoiceCloneResponse,
  MinimaxVoiceListRequest,
  MinimaxVoiceListResponse,
} from "@/types/minimax";

const MINIMAX_API_BASE = "https://api.minimaxi.com";

/** 交互式调用的超时上限：连接检测 30s、上传/克隆 120s（音频文件较大） */
const VERIFY_TIMEOUT_MS = 30_000;
const CLONE_TIMEOUT_MS = 120_000;

/**
 * 验证 API Key（集成设置的连接检测）
 * 用 get_voice 拉一小段系统音色做轻量探测：与 TTS/声音克隆同端点同鉴权，
 * 不合成音频、不消耗 token；Key 无效时 base_resp 会返回 1004/2049 等错误码。
 */
export async function verifyMinimaxApiKey(apiKey: string): Promise<void> {
  const requestBody: MinimaxVoiceListRequest = {
    voice_type: "system",
  };

  const response = await fetch(`${MINIMAX_API_BASE}/v1/get_voice`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
    signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API Key 验证失败 (${response.status}): ${errorText}`);
  }

  const data: MinimaxVoiceListResponse = await response.json();
  if (data.base_resp.status_code !== 0) {
    throw new Error(`API Key 验证失败: ${data.base_resp.status_msg}`);
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
      signal: AbortSignal.timeout(CLONE_TIMEOUT_MS),
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
      signal: AbortSignal.timeout(CLONE_TIMEOUT_MS),
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
