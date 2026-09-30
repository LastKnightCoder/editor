import { forwardRef } from "react";
import type { ImgHTMLAttributes } from "react";
import {
  createServiceRegistry,
  IEditorSlots,
  IFileService,
  IVideoContentProviders,
  IResourceService,
  type ServiceRegistration,
  type ServiceRegistry,
  type ImageBorderRadiusPreset,
  type ImageShadowPreset,
  type EditorSlots,
  type ImageAppearanceConfig,
  type VideoSlotProps,
  type AudioSlotProps,
} from "@tau/editor";
import { AudioPlayer, VideoPlayer } from "@tau/shared";
import { blogVideoContentProviders } from "../editor-providers/videoProviders";

export interface BlogPublishSettings {
  appearance?: {
    image?: {
      borderRadius?: ImageBorderRadiusPreset;
      shadow?: ImageShadowPreset | boolean;
    };
  };
}

const BLOG_DEFAULT_IMAGE_SETTINGS = {
  borderRadius: "md" as ImageBorderRadiusPreset,
  shadow: "none" as ImageShadowPreset | boolean,
};

function getBlogImageSettingValue<T extends "borderRadius" | "shadow">(
  settings: BlogPublishSettings | undefined,
  key: T
): NonNullable<NonNullable<BlogPublishSettings["appearance"]>["image"]>[T] {
  return (settings?.appearance?.image?.[key] ?? BLOG_DEFAULT_IMAGE_SETTINGS[key]) as NonNullable<
    NonNullable<BlogPublishSettings["appearance"]>["image"]
  >[T];
}

const createBlogEditorSlots = (): EditorSlots => {
  const Image = forwardRef<
    HTMLImageElement,
    ImgHTMLAttributes<HTMLImageElement> & { url: string; alt?: string }
  >(({ url, alt, className, style, onClick, onLoad, crossOrigin }, ref) => (
    <img
      ref={ref}
      src={url}
      alt={alt || url}
      className={className}
      style={style}
      onClick={onClick}
      onLoad={onLoad}
      crossOrigin={crossOrigin}
    />
  ));
  Image.displayName = "BlogImage";

  return {
    Image,
    Video: ({ src, ...rest }: VideoSlotProps) => <VideoPlayer src={src} {...rest} />,
    Audio: ({ src, ...rest }: AudioSlotProps) => <AudioPlayer src={src} {...rest} />,
  };
};

/** Blog 的服务注册项：kit 与 registry 共用同一份 */
export const blogEditorServices: ServiceRegistration = register => {
  register(IResourceService, {
    upload: async () => {
      throw new Error("Blog 模式不支持上传资源");
    },
  });

  register(IFileService, {
    select: async () => {
      throw new Error("Blog 模式不支持文件选择");
    },
    readText: async () => {
      throw new Error("Blog 模式不支持文件读取");
    },
    getBaseName: (filePath: string) => {
      const normalized = filePath.replace(/\\/g, "/");
      const parts = normalized.split("/");
      return parts.at(-1) ?? "";
    },
    getHomeDir: async () => "",
  });

  register(IEditorSlots, createBlogEditorSlots());
  register(IVideoContentProviders, blogVideoContentProviders);
};

export function createBlogEditorRegistry(): ServiceRegistry {
  return createServiceRegistry(blogEditorServices);
}

/** 图片默认外观：来自发布设置快照，缺省为中圆角、无阴影 */
export function getBlogImageAppearance(
  settingsSnapshot?: BlogPublishSettings
): ImageAppearanceConfig {
  return {
    borderRadius: getBlogImageSettingValue(settingsSnapshot, "borderRadius"),
    shadow: getBlogImageSettingValue(settingsSnapshot, "shadow"),
  };
}
