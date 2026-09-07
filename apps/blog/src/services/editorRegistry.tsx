import { forwardRef } from "react";
import type { ImgHTMLAttributes } from "react";
import {
  createServiceRegistry,
  IEditorSlots,
  IFileService,
  IVideoContentProviders,
  IResourceService,
  type ServiceRegistry,
  type ImageBorderRadiusPreset,
  type ImageShadowPreset,
  type ThemeColors,
  type EditorSlots,
  type EditorConfig,
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

const createDefaultThemeColors = (): ThemeColors => ({
  hoverClass: "hover:bg-gray-100 dark:hover:bg-zinc-800",
  activeClass: "bg-gray-100 dark:bg-zinc-800",
  hoverTextClass: "hover:text-gray-900 dark:hover:text-gray-100",
  borderClass: "border-gray-200 dark:border-gray-700",
  hoverBorderClass: "hover:border-gray-300 dark:hover:border-gray-600",
  focusBorderClass: "focus:border-blue-500 dark:focus:border-blue-400",
  textClass: "text-gray-700 dark:text-gray-300",
  secondaryTextClass: "text-gray-500 dark:text-gray-500",
  activeTextClass: "text-gray-900 dark:text-gray-100",
  cardBorderClass: "border-gray-200 dark:border-gray-700",
  cardBgClass: "bg-white dark:bg-zinc-900",
  accentColor: "#3b82f6",
  accentSoftBg: "rgba(59, 130, 246, 0.15)",
});

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
    Video: ({ src }: { src: string }) => <VideoPlayer src={src} className="w-full" />,
    Audio: ({ src, label }: { src: string; label?: string }) => (
      <AudioPlayer src={src} label={label} className="w-full" />
    ),
  };
};

const getDocumentTheme = (): "light" | "dark" => {
  if (typeof document === "undefined") {
    return "light";
  }
  const theme = document.documentElement.getAttribute("data-theme");
  if (theme === "dark" || document.documentElement.classList.contains("dark")) {
    return "dark";
  }
  return "light";
};

export function createBlogEditorRegistry(): ServiceRegistry {
  return createServiceRegistry(register => {
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
  });
}

/** Blog 编辑器全局配置：图片外观来自发布设置快照，主题取文档当前状态 */
export function createBlogEditorConfig(
  settingsSnapshot?: BlogPublishSettings,
  theme?: "light" | "dark"
): EditorConfig {
  return {
    theme: {
      mode: theme ?? getDocumentTheme(),
      colors: createDefaultThemeColors(),
    },
    appearance: {
      image: {
        borderRadius: getBlogImageSettingValue(settingsSnapshot, "borderRadius"),
        shadow: getBlogImageSettingValue(settingsSnapshot, "shadow"),
      },
    },
    openUrl: url => {
      window.open(url, "_blank", "noopener,noreferrer");
    },
  };
}
