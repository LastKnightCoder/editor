import { useState } from "react";
import { App } from "antd";
import { useMemoizedFn } from "ahooks";
import { createOrUpdateResource } from "@/commands";
import useUploadResource from "@/hooks/useUploadResource";
import type { IResource, ResourceType } from "@/types";

type AntdAppInstance = ReturnType<typeof App.useApp>;

type MoveResourceToGroupFn = (
  resourceId: number,
  groupId: number | null,
) => Promise<unknown>;

type RefreshResourcesFn = () => Promise<unknown>;

const getResourceTypeFromFile = (file: File): ResourceType => {
  const mimeType = file.type.toLowerCase();
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";

  const name = file.name.toLowerCase();
  if (name.match(/\.(png|jpe?g|gif|webp|bmp|svg)$/)) return "image";
  if (name.match(/\.(mp4|mov|avi|mkv|webm)$/)) return "video";
  if (name.match(/\.(mp3|wav|aac|flac|ogg|m4a)$/)) return "audio";
  return "attachment";
};

interface UseResourceUploadDialogParams {
  moveResourceToGroup: MoveResourceToGroupFn;
  refreshResources: RefreshResourcesFn;
  app: AntdAppInstance;
}

export function useResourceUploadDialog({
  moveResourceToGroup,
  refreshResources,
  app,
}: UseResourceUploadDialogParams) {
  const { message: messageApi } = app;

  const [uploadDialogVisible, setUploadDialogVisible] = useState(false);
  const [uploadTargetGroupId, setUploadTargetGroupId] = useState<number | null>(
    null,
  );
  const [uploadResourceName, setUploadResourceName] = useState("");
  const [selectedUploadFile, setSelectedUploadFile] = useState<File | null>(
    null,
  );
  const [uploadingResource, setUploadingResource] = useState(false);
  const uploadResource = useUploadResource();

  const handleOpenUploadResource = useMemoizedFn((groupId: number | null) => {
    setUploadTargetGroupId(groupId);
    setUploadDialogVisible(true);
    setSelectedUploadFile(null);
    setUploadResourceName("");
  });

  const handleUploadFileChange = useMemoizedFn(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0] || null;
      setSelectedUploadFile(file);
      if (file && !uploadResourceName) {
        setUploadResourceName(file.name);
      }
    },
  );

  const handleUploadDialogOk = useMemoizedFn(async () => {
    if (!selectedUploadFile) {
      messageApi.warning("请选择文件");
      return;
    }

    const finalName =
      uploadResourceName.trim() || selectedUploadFile.name || "未命名资源";

    try {
      setUploadingResource(true);
      const path = await uploadResource(selectedUploadFile);
      if (!path) {
        messageApi.error("文件上传失败");
        return;
      }

      const type = getResourceTypeFromFile(selectedUploadFile);
      const resource = (await createOrUpdateResource({
        name: finalName,
        path,
        type,
      })) as IResource;

      if (uploadTargetGroupId !== null) {
        await moveResourceToGroup(resource.id, uploadTargetGroupId);
      }

      await refreshResources();
      messageApi.success("资源已上传");
      setUploadDialogVisible(false);
      setUploadTargetGroupId(null);
      setSelectedUploadFile(null);
      setUploadResourceName("");
    } catch (error) {
      const err = error as Error;
      messageApi.error(err.message || "上传失败");
    } finally {
      setUploadingResource(false);
    }
  });

  const closeUploadDialog = useMemoizedFn(() => {
    setUploadDialogVisible(false);
    setUploadTargetGroupId(null);
    setSelectedUploadFile(null);
    setUploadResourceName("");
  });

  return {
    uploadDialogVisible,
    uploadTargetGroupId,
    uploadResourceName,
    selectedUploadFile,
    uploadingResource,
    setUploadResourceName,
    handleOpenUploadResource,
    handleUploadFileChange,
    handleUploadDialogOk,
    closeUploadDialog,
  };
}
