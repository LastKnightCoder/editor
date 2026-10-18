import { useMemoizedFn } from "ahooks";
import { copyJson } from "@tau/plugins/host";
import useSettingStore, { EImageBed } from "@/stores/useSettingStore";
import { compressImage } from "@/commands/file";
import { uploadPluginResource } from "@/commands/plugin-local";
import { copyFileToLocal } from "@/utils/resouce";
import { v4 as uuid } from "uuid";

function splitName(name: string) {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ""];
}

export const uploadResource = async (file: File): Promise<string> => {
  // 固定本次目标与配置，压缩期间切换设置不会把文件发往另一个存储。
  const { imageBed } = useSettingStore.getState().setting;
  const pluginId = imageBed.plugin?.id;
  const config = copyJson(pluginId ? (imageBed.plugin?.configurations[pluginId] ?? {}) : {});
  let processedFile = file;
  if (
    imageBed.enableCompression &&
    ["image/png", "image/jpeg", "image/jpg"].includes(file.type.toLowerCase())
  ) {
    try {
      const bytes = await compressImage(new Uint8Array(await file.arrayBuffer()), file.type);
      processedFile = new File(
        [bytes.slice().buffer as ArrayBuffer],
        `${splitName(file.name)[0]}.webp`,
        { type: "image/webp" }
      );
    } catch (error) {
      console.error("图片压缩失败，使用原始文件", error);
    }
  }
  const [stem, extension] = splitName(processedFile.name);
  const name = `${stem}_${uuid()}${extension}`;
  if (imageBed.active === EImageBed.Local) return copyFileToLocal(processedFile, name);
  if (!pluginId) throw new Error("请先配置资源上传插件");
  return uploadPluginResource({
    pluginId,
    config,
    file: {
      name,
      mimeType: processedFile.type,
      content: new Uint8Array(await processedFile.arrayBuffer()),
    },
  });
};

export default function useUploadResource() {
  return useMemoizedFn(uploadResource);
}
