export interface ImageItem {
  id: string;
  url: string;
  alt?: string;
}

export type ImagePluginValue = ImageItem[];

export interface ImagePluginConfig {
  maxImages?: number;
  imageSize?: number;
}
