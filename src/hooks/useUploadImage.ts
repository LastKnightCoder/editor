import { useMemoizedFn } from "ahooks";
import useSettingStore, { EImageBed } from "@/stores/useSettingStore.ts";
import { putObject } from '@/commands';
import { copyFileToLocal, transformGithubUrlToCDNUrl, uploadFileFromFile } from "@/utils";
import { v4 as uuid } from "uuid";
// import TinyPng, { CompressResult } from 'tinypng-lib';

const uploadImageInner = async (imageBed: any, file: File) => {
  const githubInfo = imageBed.github;
  const aliOSSInfo = imageBed.aliOSS;

  // const compressRes = (await TinyPng.compress(file, {}));
  // if (compressRes.success) {
  //   file = (compressRes as CompressResult).file;
  //   console.log('压缩后文件大小：', compressRes);
  // }

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
    const all = fileName.split('.');
    const other = all.slice(0, all.length - 1);
    const extension = all[all.length - 1];
    const objectName = other.join('.') + '_' + uuid() + '.' + extension;
    try {
      return await putObject({
        ...aliOSSInfo,
        objectName,
        file,
      });
    } catch (e) {
      console.error(e);
    }
    return null;
  } else {
    // 移动到本地目录
    const fileName = file.name;
    const all = fileName.split('.');
    const other = all.slice(0, all.length - 1);
    const extension = all[all.length - 1];
    const objectName = other.join('.') + '_' + uuid() + '.' + extension;
    // 复制文件到本地文件夹
    return await copyFileToLocal(file, objectName);
  }
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