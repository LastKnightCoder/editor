/**
 * Desktop 各编辑器服务的实现（Electron 环境）。
 * 经 editorRegistry.ts 组合注册后由编辑器消费，实现间不感知注册机制。
 */

import { importFromMarkdown as sharedImportFromMarkdown } from "@tau/markdown";
import { markdownCustomDirectives } from "@tau/shared";
import type { CompilerService, FileService, ResourceService } from "@tau/editor/src/types/services";
import type { EditorSlots } from "@tau/editor/src";
import useSettingStore from "@/stores/useSettingStore";
import { selectFile, readTextFile, getHomeDir, convertFileSrc } from "@/commands/file";
import { compileTypst } from "@/commands/typst";

// Slot 组件
import LocalImage from "@/components/LocalImage";
import LocalVideo from "@/components/LocalVideo";
import LocalAudio from "@/components/LocalAudio";

import { remoteResourceToLocal } from "@/utils";
import { getGithubCdnUrl } from "@/hooks/useGithubCdnUrl";

import { uploadResource as uploadResourceCommand } from "@/hooks/useUploadResource";
import { compileCustomBlockTailwind } from "@/services/tailwindRuntime";

let cachedHomeDir: string | null = null;
void getHomeDir()
  .then(dir => {
    cachedHomeDir = dir;
  })
  .catch(() => {
    // Keep the existing cached value on error
  });

// ==================== Resource ====================

export const desktopResourceService: ResourceService = {
  upload: async (file: File) => {
    const url = await uploadResourceCommand(file);
    if (!url) {
      throw new Error("资源上传失败");
    }
    return url;
  },

  remoteResourceToLocal: async (url: string) => {
    return await remoteResourceToLocal(url);
  },

  resolveCdnUrl: (url?: string) => {
    const cdn = useSettingStore.getState().setting.imageBed.github.cdn;
    return getGithubCdnUrl(url, cdn);
  },
};

// ==================== File ====================

export const desktopFileService: FileService = {
  select: async options => {
    return await selectFile(options);
  },

  readText: async (filePath: string) => {
    return await readTextFile(filePath);
  },

  getBaseName: (filePath: string) => {
    // Synchronous basename extraction
    const parts = filePath.replace(/\\/g, "/").split("/");
    return parts[parts.length - 1] || "";
  },

  getHomeDir: async () => {
    return cachedHomeDir || process.env.HOME || process.env.USERPROFILE || "";
  },

  convertFileSrc: (filePath: string) => {
    return convertFileSrc(filePath);
  },
};

// ==================== Compiler ====================

export const desktopCompilerService: CompilerService = {
  typst: async (code: string) => {
    return await compileTypst(code);
  },

  tailwindRuntime: async (content: string) => {
    const trimmed = content?.trim();
    if (!trimmed) {
      return "";
    }
    return await compileCustomBlockTailwind(trimmed, "tsx");
  },
};

// ==================== Markdown 导入 ====================

/** markdown 粘贴导入用的解析函数（合并业务 customDirectives），供宿主扩展工厂注入 */
export const desktopImportFromMarkdown = (
  markdown: string,
  ignoreTypes?: string[],
  options?: Parameters<typeof sharedImportFromMarkdown>[2]
) =>
  sharedImportFromMarkdown(markdown, ignoreTypes, {
    customDirectives: {
      ...markdownCustomDirectives,
      ...options?.customDirectives,
    },
  });

// ==================== UI Slots ====================

export const desktopEditorSlots: EditorSlots = {
  Image: LocalImage,
  Video: LocalVideo,
  Audio: LocalAudio,
};
