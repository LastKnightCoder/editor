import { useMemoizedFn } from "ahooks";
import useSettingStore, { EImageBed } from "@/stores/useSettingStore.ts";
import { putObject } from '@/commands';
import { transformGithubUrlToCDNUrl, uploadFileFromFile } from "@/utils";
import { v4 as uuid } from "uuid";

const uploadImageInner = async (imageBed: any, file: File) => {
  const githubInfo = imageBed.github;
  const aliOSSInfo = imageBed.aliOSS;

  if (imageBed.active === EImageBed.Github) {
    try {
      const res = await uploadFileFromFile(file, githubInfo);
      if (res) {
        const { content: { download_url } } = res;
        return transformGithubUrlToCDNUrl(download_url, githubInfo.branch);
      }
      return null;
    } catch {
      return null;
    }
  } else if (imageBed.active === EImageBed.AliOSS) {
    const fileName = file.name;
    const objectName = fileName.split('.')[0] + '_' + uuid() + '.' + fileName.split('.')[1];
    try {
      return await putObject({
        ...aliOSSInfo,
        objectName,
        file,
      });
    } catch (e) {
      console.log(e);
    }
    return null;
  }
  return null;
}

const useUploadImage = () => {
  const {
    imageBed
  } = useSettingStore(state => ({
    imageBed: state.setting.imageBed,
  }));

  return useMemoizedFn(async (file: File) => {
    return await uploadImageInner(imageBed, file);
  });
}

export default useUploadImage;

export const uploadImage = async (file: File) => {
  const {
    imageBed
  } = useSettingStore.getState().setting;

  return await uploadImageInner(imageBed, file);
}