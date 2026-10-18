/**
 * Desktop 各编辑器服务的实现（Electron 环境）。
 * 经 editorRegistry.ts 组合注册后由编辑器消费，实现间不感知注册机制。
 */
import { type FileService, type ResourceService } from "@tau/shared/host-services";

import type { TypstCompiler } from "@tau/editor-diagram/services";
import { type EditorSlots } from "@tau/editor-media/services";
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
    const cdn = useSettingStore.getState().setting.imageBed.githubCdn;
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

export const desktopTypstCompiler: TypstCompiler = {
  compile: async (code: string) => {
    return await compileTypst(code);
  },
};

// ==================== Markdown 导入 ====================

/** markdown 粘贴导入用的解析函数：与全应用共用 desktop 处理器（含业务元素 codec） */
export { importFromMarkdown as desktopImportFromMarkdown } from "@/utils/markdown";

// ==================== UI Slots ====================

export const desktopEditorSlots: EditorSlots = {
  Image: LocalImage,
  Video: LocalVideo,
  Audio: LocalAudio,
};
