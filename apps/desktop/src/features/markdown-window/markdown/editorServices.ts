/**
 * Markdown 窗口对编辑器服务的两处覆盖：
 * - 图片上传：图床为「本地」时存到 md 同目录（重名追加 copy 序号，可选压缩为 webp），返回相对文件名；
 *   其它图床或保存失败时走默认上传；
 * - 链接打开：带协议的走系统浏览器；本地 / 相对路径按当前文件目录解析，.md 在本窗口打开，
 *   目录与其它文件交给系统默认应用。
 */

import { useMemo } from "react";
import { useMemoizedFn } from "ahooks";
import {
  createChildRegistry,
  IOpenerService,
  IResourceService,
  useServiceRegistry,
  type ServiceRegistry,
} from "@tau/editor/src";
import { toast } from "@tau/ui";
import {
  compressImage,
  getDirectoryName,
  isDirectory,
  openExternal,
  openFileWithDefaultApp,
  pathExists,
  resolvePathFrom,
  writeBinaryFile,
} from "@/commands";
import { uploadResource } from "@/hooks/useUploadResource";
import useSettingStore, { EImageBed } from "@/stores/useSettingStore";
import { joinPath, splitExtension } from "../paths";

const COMPRESSIBLE_TYPES = ["image/png", "image/jpeg", "image/jpg"];

const copyName = (fileName: string, index: number) => {
  if (index === 0) return fileName;
  const { stem, ext } = splitExtension(fileName);
  return index === 1 ? `${stem} copy${ext}` : `${stem} copy${index - 1}${ext}`;
};

async function availablePath(dir: string, fileName: string) {
  for (let index = 0; index < 1000; index += 1) {
    const name = copyName(fileName, index);
    const path = joinPath(dir, name);
    if (!(await pathExists(path))) return { name, path };
  }
  throw new Error("无法生成可用的图片文件名");
}

async function uploadRemote(file: File) {
  const url = await uploadResource(file);
  if (!url) throw new Error("图片上传失败");
  return url;
}

const hasScheme = (value: string) => /^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(value);
const isWindowsAbsolute = (value: string) => /^[a-zA-Z]:[\\/]/.test(value);
const stripSuffix = (value: string) => value.split("#")[0].split("?")[0];

function fileUrlToPath(value: string) {
  const url = new URL(value);
  let pathname = decodeURIComponent(url.pathname || "");
  if (/^\/[A-Za-z]:/.test(pathname)) pathname = pathname.slice(1);
  return url.hostname && url.hostname !== "localhost" ? `//${url.hostname}${pathname}` : pathname;
}

async function resolveLocalTarget(rawUrl: string, currentFile: string) {
  if (rawUrl.startsWith("#")) throw new Error("暂不支持锚点跳转");
  if (/^file:\/\//i.test(rawUrl)) return fileUrlToPath(rawUrl);
  if (isWindowsAbsolute(rawUrl) || rawUrl.startsWith("/") || rawUrl.startsWith("\\\\")) {
    return decodeURIComponent(stripSuffix(rawUrl));
  }
  const relative = decodeURIComponent(stripSuffix(rawUrl));
  if (!relative) throw new Error("暂不支持锚点跳转");
  return resolvePathFrom(await getDirectoryName(currentFile), relative);
}

async function openWithDefaultApp(path: string) {
  const failure = await openFileWithDefaultApp(path);
  if (failure) throw new Error(failure);
}

export function useMarkdownEditorServices(
  filePath: string,
  onOpenMarkdown: (path: string) => void
) {
  const baseRegistry = useServiceRegistry();

  const upload = useMemoizedFn(async (file: File): Promise<string> => {
    const { imageBed } = useSettingStore.getState().setting;
    if (imageBed.active !== EImageBed.Local) return uploadRemote(file);
    try {
      let data = new Uint8Array(await file.arrayBuffer());
      let fileName = file.name;
      if (imageBed.enableCompression && COMPRESSIBLE_TYPES.includes(file.type.toLowerCase())) {
        data = (await compressImage(data, file.type)) as Uint8Array<ArrayBuffer>;
        fileName = `${splitExtension(file.name).stem}.webp`;
      }
      const target = await availablePath(await getDirectoryName(filePath), fileName);
      await writeBinaryFile(target.path, data);
      return target.name;
    } catch (error) {
      console.error("保存图片到文档目录失败，改走默认上传:", error);
      return uploadRemote(file);
    }
  });

  const openUrl = useMemoizedFn(async (rawUrl: string) => {
    const url = rawUrl.trim();
    if (!url) return;
    if (!/^file:\/\//i.test(url) && hasScheme(url) && !isWindowsAbsolute(url)) {
      await openExternal(url);
      return;
    }
    try {
      const target = await resolveLocalTarget(url, filePath);
      if (!(await pathExists(target))) {
        toast.error("链接目标不存在");
        return;
      }
      if (!(await isDirectory(target)) && /\.(md|markdown)$/i.test(target)) {
        onOpenMarkdown(target);
        return;
      }
      await openWithDefaultApp(target);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "打开链接失败");
    }
  });

  const registry = useMemo<ServiceRegistry>(
    () =>
      createChildRegistry(baseRegistry, register => {
        register(IResourceService, { ...baseRegistry.get(IResourceService), upload });
        register(IOpenerService, { open: openUrl });
      }),
    [baseRegistry, upload, openUrl]
  );
  return registry;
}
