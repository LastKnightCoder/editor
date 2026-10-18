import type { UploadFile } from "@tau/plugins";
import { copyJson } from "@tau/plugins/host";
import { v4 as uuid } from "uuid";
import useSettingStore, { EImageBed } from "@/stores/useSettingStore";
import { uploadPluginResource } from "@/commands/plugin-local";

export function splitUploadName(name: string) {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ""];
}
export function uniqueUploadName(name: string) {
  const [stem, extension] = splitUploadName(name);
  return `${stem}_${uuid()}${extension}`;
}
export function uploadRemoteResource(file: UploadFile, signal: AbortSignal): Promise<string> {
  signal.throwIfAborted();
  const { imageBed } = useSettingStore.getState().setting;
  const id = imageBed.plugin?.id;
  if (imageBed.active !== EImageBed.Plugin || !id)
    throw new Error("请先在资源存储中配置远端上传插件；本地保存不能提供公网地址");
  return uploadPluginResource(
    {
      pluginId: id,
      config: copyJson(imageBed.plugin?.configurations[id] ?? {}),
      file: { ...file, name: uniqueUploadName(file.name), content: new Uint8Array(file.content) },
    },
    signal
  );
}
