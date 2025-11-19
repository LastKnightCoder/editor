import { useMemoizedFn } from "ahooks";
import useSettingStore, {
  EImageBed,
  type ISetting,
} from "@/stores/useSettingStore.ts";
import { putObject, compressImage, s3Upload, webdavUpload } from "@/commands";
import { copyFileToLocal, uploadFileFromFile } from "@/utils";
import { v4 as uuid } from "uuid";

const uploadResourceInner = async (
  imageBed: ISetting["imageBed"],
  integration: ISetting["integration"],
  file: File,
): Promise<string | null> => {
  const enableCompression = imageBed.enableCompression;

  // 处理图片压缩
  let processedFile = file;

  if (enableCompression) {
    const supportedTypes = ["image/png", "image/jpeg", "image/jpg"];
    if (supportedTypes.includes(file.type.toLowerCase())) {
      try {
        const originalSize = file.size;
        const buffer = new Uint8Array(await file.arrayBuffer());
        const compressedBuffer = await compressImage(buffer, file.type);
        const compressedSize = compressedBuffer.byteLength;

        // 创建新的 File 对象，扩展名改为 webp
        const fileName = file.name;
        const all = fileName.split(".");
        const other = all.slice(0, all.length - 1);
        const newFileName = other.join(".") + ".webp";

        // 将 Uint8Array 转换为 ArrayBuffer，然后创建 File
        const arrayBuffer = compressedBuffer.slice(0).buffer as ArrayBuffer;
        processedFile = new File([arrayBuffer], newFileName, {
          type: "image/webp",
        });

        // 打印压缩信息
        const compressionRatio = (
          ((originalSize - compressedSize) / originalSize) *
          100
        ).toFixed(2);
        console.log(
          `图片压缩成功:\n` +
            `  文件名: ${fileName} -> ${newFileName}\n` +
            `  压缩前: ${(originalSize / 1024).toFixed(2)} KB\n` +
            `  压缩后: ${(compressedSize / 1024).toFixed(2)} KB\n` +
            `  压缩率: ${compressionRatio}%`,
        );
      } catch (error) {
        console.error("图片压缩失败，使用原始文件:", error);
      }
    }
  }

  if (imageBed.active === EImageBed.Github) {
    try {
      const githubInfo = {
        token: integration.github.token,
        repo: imageBed.github.repo,
        branch: imageBed.github.branch,
        user: integration.github.user,
        cdn: imageBed.github.cdn,
      };
      const res = await uploadFileFromFile(processedFile, githubInfo);
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
    const fileName = processedFile.name;
    const all = fileName.split(".");
    const other = all.slice(0, all.length - 1);
    const extension = all[all.length - 1];
    const objectName = other.join(".") + "_" + uuid() + "." + extension;
    const finalObjectName = imageBed.aliOSS.pathPrefix
      ? `${imageBed.aliOSS.pathPrefix.replace(/\/$/, "")}/${objectName}`
      : objectName;
    try {
      return await putObject({
        accessKeyId: integration.aliOSS.accessKeyId,
        accessKeySecret: integration.aliOSS.accessKeySecret,
        bucket: imageBed.aliOSS.bucket,
        region: imageBed.aliOSS.region,
        objectName: finalObjectName,
        file: new Uint8Array(await processedFile.arrayBuffer()),
      });
    } catch (e) {
      console.error(e);
    }
    return null;
  } else if (imageBed.active === EImageBed.S3) {
    // S3 上传
    const fileName = processedFile.name;
    const all = fileName.split(".");
    const other = all.slice(0, all.length - 1);
    const extension = all[all.length - 1];
    const objectName = other.join(".") + "_" + uuid() + "." + extension;
    const key = imageBed.s3.pathPrefix
      ? `${imageBed.s3.pathPrefix.replaceAll(/\/$|^\//g, "")}/${objectName}`
      : objectName;

    try {
      return await s3Upload({
        accessKeyId: integration.s3.accessKeyId,
        secretAccessKey: integration.s3.secretAccessKey,
        bucket: imageBed.s3.bucket,
        region: imageBed.s3.region,
        endpoint: integration.s3.endpoint,
        urlStyle: integration.s3.urlStyle,
        key,
        file: new Uint8Array(await processedFile.arrayBuffer()),
        contentType: processedFile.type,
      });
    } catch (e) {
      console.error("S3 上传失败:", e);
      return null;
    }
  } else if (imageBed.active === EImageBed.WebDav) {
    // WebDAV 上传
    const fileName = processedFile.name;
    const all = fileName.split(".");
    const other = all.slice(0, all.length - 1);
    const extension = all[all.length - 1];
    const objectName = other.join(".") + "_" + uuid() + "." + extension;
    const remotePath = imageBed.webdav.pathPrefix
      ? `${imageBed.webdav.pathPrefix.replace(/\/$/, "")}/${objectName}`
      : `/${objectName}`;

    try {
      return await webdavUpload({
        url: integration.webdav.url,
        username: integration.webdav.username,
        password: integration.webdav.password,
        remotePath,
        file: new Uint8Array(await processedFile.arrayBuffer()),
        contentType: processedFile.type,
      });
    } catch (e) {
      console.error("WebDAV 上传失败:", e);
      return null;
    }
  } else {
    // 移动到本地目录
    const fileName = processedFile.name;
    const all = fileName.split(".");
    const other = all.slice(0, all.length - 1);
    const extension = all[all.length - 1];
    const objectName = other.join(".") + "_" + uuid() + "." + extension;
    // 复制文件到本地文件夹
    return await copyFileToLocal(processedFile, objectName);
  }
};

const useUploadResource = () => {
  const { imageBed, integration } = useSettingStore((state) => ({
    imageBed: state.setting.imageBed,
    integration: state.setting.integration,
  }));

  return useMemoizedFn(async (file: File) => {
    return await uploadResourceInner(imageBed, integration, file);
  });
};

export default useUploadResource;

export const uploadResource = async (file: File) => {
  const { imageBed, integration } = useSettingStore.getState().setting;

  return await uploadResourceInner(imageBed, integration, file);
};
