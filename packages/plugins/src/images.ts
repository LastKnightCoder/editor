import type { Disposable, JsonValue } from "./contract";

export interface ImageFile {
  name: string;
  mimeType: string;
  content: Uint8Array;
}

export interface ImageOptions {
  size?: string;
  quality?: string;
  outputFormat?: "png" | "jpeg" | "webp";
  background?: string;
  count?: number;
}

export interface ImageGenerateRequest {
  prompt: string;
  options?: ImageOptions;
}

export interface ImageEditRequest extends ImageGenerateRequest {
  images: readonly ImageFile[];
}

export interface GeneratedImage extends ImageFile {
  revisedPrompt?: string;
}

export interface ImageInstance {
  generate?(request: ImageGenerateRequest, signal: AbortSignal): Promise<GeneratedImage[]>;
  edit?(request: ImageEditRequest, signal: AbortSignal): Promise<GeneratedImage[]>;
}

export interface ImageProviderDefinition {
  id: string;
  name: string;
  create(config: JsonValue, modelId: string): ImageInstance;
}

export interface PluginImages {
  register(definition: ImageProviderDefinition): Disposable;
}
