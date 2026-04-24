export interface ConfigItem {
  id: string;
  name: string;
  apiKey: string;
  baseUrl: string;
  models: ModelItem[];
  currentModel?: string;
}

export interface ModelItem {
  name: string;
  description: string;
  features: {
    online: boolean;
    thinking: boolean;
    image: boolean;
    video: boolean;
    audio: boolean;
    file: boolean;
    multimodal?: boolean;
  };
  messageFormat?: "openai" | "claude";
  apiProtocol?: "chat-completions" | "responses";
}

export interface ConfigFormData {
  name: string;
  apiKey: string;
  baseUrl: string;
  id?: string;
}

export interface ModelFormData {
  name: string;
  description: string;
  features: {
    online: boolean;
    thinking: boolean;
    image: boolean;
    video: boolean;
    audio: boolean;
    file: boolean;
    multimodal?: boolean;
  };
  messageFormat?: "openai" | "claude";
  apiProtocol?: "chat-completions" | "responses";
}
