export type ImageProviderType = "openai";

export interface ImageProviderConfig {
  id: string;
  name: string;
  providerType: ImageProviderType;
  baseUrl: string;
  apiKey: string;
  modelName: string;
}

export interface ImageGenerationStoreShape {
  currentProviderId: string;
  providers: ImageProviderConfig[];
}

export interface ImageResult {
  b64Json?: string;
  url?: string;
  mimeType?: string;
  revisedPrompt?: string;
}

export interface ImageGenerateParams {
  config: ImageProviderConfig;
  prompt: string;
  options?: Record<string, unknown>;
  signal?: AbortSignal;
}

export interface ImageEditParams {
  config: ImageProviderConfig;
  prompt: string;
  imageFiles: File[];
  options?: Record<string, unknown>;
  signal?: AbortSignal;
}

export interface IImageGenerationProvider {
  readonly type: ImageProviderType;
  generate(params: ImageGenerateParams): Promise<ImageResult[]>;
  edit(params: ImageEditParams): Promise<ImageResult[]>;
}
