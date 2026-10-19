export interface ImageProviderConfig {
  id: string;
  name: string;
  pluginId: string;
  modelId: string;
  config: unknown;
}

export interface ImageGenerationStoreShape {
  currentProviderId: string;
  providers: ImageProviderConfig[];
}

export interface UploadedImageResult {
  url: string;
  mimeType: string;
  fileName: string;
  revisedPrompt?: string;
}
