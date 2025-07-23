import { Role } from "@/constants";

export interface Message {
  role: Role;
  content: string;
  reasoning_content?: string;
}

export interface ProviderConfig {
  id: string;
  name: string;
  apiKey: string;
  baseUrl: string;
  models: ModelConfig[];
}

export interface ModelConfig {
  name: string;
  description: string;
  features: {
    online: boolean;
    thinking: boolean;
    multimodal: boolean;
  };
}

export interface LLMUsageConfig {
  providerId: string;
  modelName: string;
}
