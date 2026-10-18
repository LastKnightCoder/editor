export interface MinimaxVoice {
  voice_id: string;
  voice_name?: string;
  description?: string[];
  created_time: string;
  voice_type: "system_voice" | "voice_cloning" | "voice_generation";
}

export interface MinimaxVoiceListRequest {
  voice_type: "system" | "voice_cloning" | "voice_generation" | "all";
}

export interface MinimaxVoiceListResponse {
  system_voice?: MinimaxVoice[];
  voice_cloning?: MinimaxVoice[];
  voice_generation?: MinimaxVoice[];
  base_resp: {
    status_code: number;
    status_msg: string;
  };
}

export interface MinimaxFileUploadResponse {
  file: {
    file_id: string;
    bytes: number;
    created_at: number;
    filename: string;
    purpose: string;
  };
  base_resp: {
    status_code: number;
    status_msg: string;
  };
}

export interface MinimaxVoiceCloneRequest {
  file_id: string;
  voice_id: string;
}

export interface MinimaxVoiceCloneResponse {
  extra_info: Record<string, unknown>;
  base_resp: {
    status_code: number;
    status_msg: string;
  };
}

export type MinimaxSpeechModel =
  "speech-2.8-hd" | "speech-2.8-turbo" | "speech-2.6-hd" | "speech-2.6-turbo";

export interface MinimaxChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface MinimaxChatRequest {
  model: string;
  messages: MinimaxChatMessage[];
  stream?: boolean;
  temperature?: number;
  max_tokens?: number;
}

export interface MinimaxChatResponse {
  id: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface MinimaxChatStreamChunk {
  id: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    delta: {
      role?: string;
      content?: string;
    };
    finish_reason: string | null;
  }>;
}
