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
  contextLength: number;
  distance: number;
  features: {
    multimodal: boolean;
  };
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
  contextLength: number;
  distance: number;
  features: {
    multimodal: boolean;
  };
}
