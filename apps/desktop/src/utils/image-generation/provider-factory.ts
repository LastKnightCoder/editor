import type {
  IImageGenerationProvider,
  ImageProviderConfig,
  ImageProviderType,
} from "@/types/imageGeneration";
import { OpenAIImageProvider } from "./providers/openai-provider";

const providerRegistry: Record<
  ImageProviderType,
  new () => IImageGenerationProvider
> = {
  openai: OpenAIImageProvider,
};

/**
 * 图片提供商工厂 —— 根据 providerType 创建对应 provider 实例
 */
export class ImageProviderFactory {
  static registerProvider(
    type: ImageProviderType,
    ctor: new () => IImageGenerationProvider,
  ) {
    providerRegistry[type] = ctor;
  }

  static createProvider(config: ImageProviderConfig): IImageGenerationProvider {
    const Ctor = providerRegistry[config.providerType];
    if (!Ctor) {
      throw new Error(`Unknown image provider type: ${config.providerType}`);
    }
    return new Ctor();
  }
}

export type {
  ImageProviderConfig,
  IImageGenerationProvider,
  ImageProviderType,
};
