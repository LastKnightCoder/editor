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

export interface MinimaxTTSRequest {
  model: string;
  text: string;
  stream?: boolean;
  voice_setting: {
    voice_id: string;
    speed?: number;
    vol?: number;
    pitch?: number;
    emotion?: string;
  };
  audio_setting?: {
    sample_rate?: number;
    bitrate?: number;
    format?: string;
    channel?: number;
  };
  subtitle_enable?: boolean;
}

export interface MinimaxTTSResponse {
  data: {
    audio: string; // hex 编码的音频数据
    status: number;
  };
  extra_info: {
    audio_length: number;
    audio_sample_rate: number;
    audio_size: number;
    bitrate: number;
    word_count: number;
    invisible_character_ratio: number;
    usage_characters: number;
    audio_format: string;
    audio_channel: number;
  };
  trace_id: string;
  base_resp: {
    status_code: number;
    status_msg: string;
  };
}

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

export interface PodcastGenerationProgress {
  stage:
    | "parsing"
    | "script"
    | "tts"
    | "music"
    | "merging"
    | "upload"
    | "complete";
  stageProgress: number;
  ttsTotal?: number;
  ttsCompleted?: number;
  message: string;
}

export interface PodcastScriptLine {
  speaker: string;
  text: string;
  voiceId: string;
}
