import { useMemoizedFn } from "ahooks";
import useSettingStore, { EImageBed } from "@/stores/useSettingStore.ts";
import { putObject } from "@/commands";
import { copyFileToLocal, uploadFileFromFile } from "@/utils";
import { v4 as uuid } from "uuid";

const uploadResourceInner = async (
  imageBed: any,
  file: File,
): Promise<string | null> => {
  const githubInfo = imageBed.github;
  const aliOSSInfo = imageBed.aliOSS;

  if (imageBed.active === EImageBed.Github) {
    try {
      const res = await uploadFileFromFile(file, githubInfo);
      if (res) {
        const {
          content: { download_url },
        } = res;
        return download_url;
      }
      return null;
    } catch {
      return null;
    }
  } else if (imageBed.active === EImageBed.AliOSS) {
    const fileName = file.name;
    const all = fileName.split(".");
    const other = all.slice(0, all.length - 1);
    const extension = all[all.length - 1];
    const objectName = other.join(".") + "_" + uuid() + "." + extension;
    try {
      return await putObject({
        ...aliOSSInfo,
        objectName,
        file: new Uint8Array(await file.arrayBuffer()),
      });
    } catch (e) {
      console.error(e);
    }
    return null;
  } else {
    // 移动到本地目录
    const fileName = file.name;
    const all = fileName.split(".");
    const other = all.slice(0, all.length - 1);
    const extension = all[all.length - 1];
    const objectName = other.join(".") + "_" + uuid() + "." + extension;
    // 复制文件到本地文件夹
    return await copyFileToLocal(file, objectName);
  }
};

const useUploadResource = () => {
  const { imageBed } = useSettingStore((state) => ({
    imageBed: state.setting.imageBed,
  }));

  return useMemoizedFn(async (file: File) => {
    return await uploadResourceInner(imageBed, file);
  });
};

export default useUploadResource;

export const uploadResource = async (file: File) => {
  const { imageBed } = useSettingStore.getState().setting;

  return await uploadResourceInner(imageBed, file);
};
