import { Library } from "lucide-react";
import type {
  MediaInsertPayload,
  MediaInsertSource,
  MediaSelector,
  MediaType,
} from "@tau/editor/src";
import ResourcePickerModal from "@/components/ResourcePickerModal";
import type { IResource, ResourceType } from "@/types";

import { showMediaNode } from "./mediaModalHost";

/**
 * 资源库选择能力（desktop）：
 * 以"注册的插入来源"（slash 菜单二级项）与"注册的媒体选择器"（画廊加图等）
 * 两种身份向编辑器注入。编辑器内核不感知资源库概念，只在菜单中列出
 * 注册项并调用 open，弹窗与选择过程完全由宿主决定。
 */

const MEDIA_TYPE_LABELS: Record<MediaType, string> = {
  image: "图片",
  video: "视频",
  audio: "音频",
};

const toInsertPayload = (mediaType: MediaType, resource: IResource): MediaInsertPayload => {
  if (mediaType === "image") {
    return { src: resource.path, attributes: { previewUrl: resource.path } };
  }
  if (mediaType === "audio") {
    return { src: resource.path, title: resource.name };
  }
  return { src: resource.path };
};

/** slash 菜单"资源库"入口：多选时依次插入多个媒体元素 */
export const resourceLibraryInsertSource: MediaInsertSource = {
  id: "resource-library",
  label: "资源库",
  icon: Library,
  mediaTypes: ["image", "video", "audio"],
  open: ({ mediaType, onInsert }) => {
    const close = showMediaNode(
      <ResourcePickerModal
        open
        onCancel={() => close()}
        allowedTypes={[mediaType] as ResourceType[]}
        multiple
        title={`选择${MEDIA_TYPE_LABELS[mediaType]}`}
        onConfirm={resources => {
          const picked = resources.filter(resource => resource.path);
          if (picked.length > 0) {
            onInsert(picked.map(resource => toInsertPayload(mediaType, resource)));
          }
          close();
        }}
      />
    );
  },
};

/** 已有媒体内容编辑 UI 的选择入口（内核只渲染入口并调用 select） */
export const resourceLibrarySelector: MediaSelector = {
  id: "resource-library",
  label: "从资源库选择",
  mediaTypes: ["image", "video", "audio"],
  select: ({ mediaType, multiple, onSelected }) => {
    const close = showMediaNode(
      <ResourcePickerModal
        open
        onCancel={() => close()}
        allowedTypes={[mediaType] as ResourceType[]}
        multiple={multiple}
        title={`选择${MEDIA_TYPE_LABELS[mediaType]}`}
        onConfirm={resources => {
          const picked = resources
            .filter(resource => resource.path)
            .map(resource => ({ url: resource.path, name: resource.name }));
          if (picked.length > 0) {
            onSelected(picked);
          }
          close();
        }}
      />
    );
  },
};
