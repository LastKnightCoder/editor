import { IResourceService } from "@tau/shared/host-services";
import { Editor, Element as SlateElement, Path, Transforms } from "slate";
import { ReactEditor } from "slate-react";
import { v4 as getUuid } from "uuid";
import { notifierOf } from "@tau/editor/api";
import { Link, Plus, Upload } from "lucide-react";

import { type IBlockPanelListItem } from "@tau/editor/api";
import { type MediaInsertPayload, type MediaType } from "../services/mediaProviders";
import { IMediaInsertSources, IVideoContentProviders } from "../services/tokens";
import { canSetOrInsertNode, setOrInsertNode } from "@tau/editor/api";
import { getCommandElementPath } from "@tau/editor/api";
import type { ImageElement } from "../types/element/image";
import type { VideoElement } from "../types/element/video";
import type { AudioElement } from "../types/element/audio";

/**
 * 媒体插入助手：slash 菜单二级入口的统一实现。
 * 媒体扩展提供"本地上传 / 网络地址"两个通用入口，宿主注册的
 * MediaInsertSource 经 getMediaInsertMenuItems 一并列出。
 */

type AnyMediaElement = ImageElement | VideoElement | AudioElement;

const MEDIA_TYPE_LABELS: Record<MediaType, string> = {
  image: "图片",
  video: "视频",
  audio: "音频",
};

const MEDIA_TYPE_SEARCH_KEYWORDS: Record<MediaType, string[]> = {
  image: ["image", "picture", "pic", "tupian"],
  video: ["video", "shipin"],
  audio: ["audio", "yinpin"],
};

/** 叶子项统一携带中文名 + 英文/拼音关键字，供 slash 菜单过滤命中 */
const getMediaTypeKeywords = (mediaType: MediaType) => [
  MEDIA_TYPE_LABELS[mediaType],
  ...MEDIA_TYPE_SEARCH_KEYWORDS[mediaType],
];

/** 各媒体类型的"上传中"标志：空态占位组件依据它显示上传反馈并禁用重复触发 */
const UPLOADING_FLAG: Record<MediaType, Record<string, unknown>> = {
  image: { pasteUploading: true },
  video: { uploading: true },
  audio: { uploading: true },
};

const CLEAR_UPLOADING_FLAG: Record<MediaType, Record<string, unknown>> = {
  image: { pasteUploading: false },
  video: { uploading: false },
  audio: { uploading: false },
};

const buildMediaElement = (mediaType: MediaType, payload: MediaInsertPayload): AnyMediaElement => {
  // attributes 属宿主透传字段，置于保留字段之前，避免覆盖媒体扩展字段
  const base: Record<string, unknown> = {
    ...payload.attributes,
    uuid: getUuid(),
  };
  if (mediaType === "image") {
    return {
      ...base,
      type: "image",
      url: payload.src,
      children: [{ type: "formatted", text: "" }],
    } as ImageElement;
  }
  if (mediaType === "video") {
    return {
      ...base,
      type: "video",
      src: payload.src,
      metaInfo: payload.metaInfo,
      children: [{ type: "formatted", text: "" }],
    } as VideoElement;
  }
  return {
    ...base,
    type: "audio",
    src: payload.src,
    title: payload.title,
    children: [{ type: "formatted", text: "" }],
  } as AudioElement;
};

/** 在光标处插入媒体元素；批量时依次追加为同级元素。返回是否插入成功 */
export const insertMediaPayloads = (
  editor: Editor,
  mediaType: MediaType,
  input: MediaInsertPayload | MediaInsertPayload[]
) => {
  const payloads = Array.isArray(input) ? input : [input];
  const [first, ...rest] = payloads;
  if (!first) {
    return false;
  }
  const firstPath = setOrInsertNode(editor, buildMediaElement(mediaType, first));
  if (!firstPath) {
    return false;
  }
  let referencePath = firstPath;
  rest.forEach(payload => {
    referencePath = Path.next(referencePath);
    Transforms.insertNodes(editor, buildMediaElement(mediaType, payload), {
      at: referencePath,
    });
  });
  return true;
};

// 常驻 DOM 的隐藏 input：Android WebView 对未挂载 input 的文件选择回调
// 可能立即回收底层句柄，导致 onchange 后 arrayBuffer 挂起（桌面无此问题）
let sharedPickerInput: HTMLInputElement | null = null;
function acquirePickerInput(): HTMLInputElement {
  if (!sharedPickerInput) {
    sharedPickerInput = document.createElement("input");
    sharedPickerInput.type = "file";
    sharedPickerInput.style.display = "none";
    document.body.appendChild(sharedPickerInput);
  }
  return sharedPickerInput;
}

/** 打开本地文件选择框，选择后上传并插入（带 uploading 占位反馈）；
 * 传入 targetElement 时在既有空元素上就地填充，不依赖当前选区；
 * capture 用于移动端直接拉起相机；onComplete 在上传结束（成功/失败）或
 * 取消选择（WebView 支持 cancel 事件时）后回调，供宿主恢复键盘焦点 */
export const openLocalMediaPicker = (
  editor: Editor,
  mediaType: MediaType,
  targetElement?: AnyMediaElement,
  options?: { capture?: boolean; onComplete?: () => void }
) => {
  const input = acquirePickerInput();
  input.accept = mediaType === "image" ? "image/*" : mediaType === "video" ? "video/*" : "audio/*";
  if (options?.capture) {
    input.setAttribute("capture", "environment");
  } else {
    input.removeAttribute("capture");
  }
  // 重置以允许连续选择同一文件
  input.value = "";
  input.oncancel = () => options?.onComplete?.();
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) {
      options?.onComplete?.();
      return;
    }
    try {
      await uploadAndInsertMedia(editor, mediaType, file, targetElement);
    } finally {
      options?.onComplete?.();
    }
  };
  input.click();
};

const findMediaByUuid = (editor: Editor, mediaType: MediaType, uuid: string) => {
  return Array.from(
    Editor.nodes(editor, {
      at: [],
      match: n =>
        SlateElement.isElement(n) && n.type === mediaType && (n as AnyMediaElement).uuid === uuid,
    })
  )[0];
};

/** 上传完成后的元素属性（清上传标志并写入最终地址） */
const buildUploadedProperties = (
  mediaType: MediaType,
  url: string,
  file: File,
  currentTitle?: string
) => {
  if (mediaType === "image") {
    return { url, pasteUploading: false };
  }
  if (mediaType === "video") {
    return { src: url, uploading: false };
  }
  return { src: url, uploading: false, title: currentTitle || file.name };
};

const uploadAndInsertMedia = async (
  editor: Editor,
  mediaType: MediaType,
  file: File,
  targetElement?: AnyMediaElement
) => {
  if (targetElement) {
    if (targetElement.type !== mediaType) return;
    const startPath = getCommandElementPath(editor, { element: targetElement });
    if (!startPath) return;
    const target = Editor.pathRef(editor, startPath);
    const currentPath = () => {
      const path = target.current;
      return path && Editor.node(editor, path)[0].type === mediaType ? path : null;
    };
    try {
      Transforms.setNodes(editor, UPLOADING_FLAG[mediaType], { at: startPath });
      const url = await editor.getService(IResourceService).upload(file);
      if (!url) {
        throw new Error("上传失败");
      }
      const path = currentPath();
      if (path)
        Transforms.setNodes(
          editor,
          buildUploadedProperties(
            mediaType,
            url,
            file,
            targetElement.type === "audio" ? targetElement.title : undefined
          ),
          { at: path }
        );
    } catch (error) {
      console.error("上传媒体失败:", error);
      notifierOf(editor).error("上传失败");
      const path = currentPath();
      if (path) Transforms.setNodes(editor, CLEAR_UPLOADING_FLAG[mediaType], { at: path });
    } finally {
      target.unref();
    }
    return;
  }

  const placeholder = buildMediaElement(
    mediaType,
    mediaType === "audio" ? { src: "", title: file.name } : { src: "" }
  );
  const firstPath = setOrInsertNode(editor, {
    ...placeholder,
    ...UPLOADING_FLAG[mediaType],
  } as AnyMediaElement);
  if (!firstPath) {
    return;
  }
  const uuid = placeholder.uuid!;

  try {
    const url = await editor.getService(IResourceService).upload(file);
    if (!url) {
      throw new Error("上传失败");
    }
    const entry = findMediaByUuid(editor, mediaType, uuid);
    if (entry) {
      Transforms.setNodes(editor, buildUploadedProperties(mediaType, url, file) as never, {
        at: entry[1],
      });
    }
  } catch (error) {
    console.error("上传媒体失败:", error);
    notifierOf(editor).error("上传失败");
    const entry = findMediaByUuid(editor, mediaType, uuid);
    if (entry) {
      // 仅按 uuid 定位删除，避免上传期间文档被编辑导致静态 path 误删其它节点
      Editor.withoutNormalizing(editor, () => {
        Transforms.delete(editor, { at: entry[1] });
        Transforms.insertNodes(
          editor,
          {
            type: "paragraph",
            children: [{ type: "formatted", text: "" }],
          },
          { at: entry[1], select: true }
        );
      });
    }
  }
};

const MEDIA_URL_PLACEHOLDERS: Record<MediaType, string> = {
  image: "https://example.com/image.png",
  video: "https://example.com/video.mp4",
  audio: "https://example.com/audio.mp3",
};

const CANNOT_INSERT_HINT = "当前选区无法插入，请将光标置于正文空行后重试";

/** 打开"网络地址"输入框并在光标处插入；输入框由提示服务承接（桌面默认 Dialog，mobile 底部面板） */
export const openMediaUrlInput = async (editor: Editor, mediaType: MediaType) => {
  if (ReactEditor.isReadOnly(editor)) return;
  const notifier = notifierOf(editor);
  const url = await notifier.prompt({
    title: `插入网络${MEDIA_TYPE_LABELS[mediaType]}`,
    placeholder: MEDIA_URL_PLACEHOLDERS[mediaType],
    confirmText: "插入",
    inputMode: "url",
    validate: value => {
      if (mediaType === "video" && isProviderSourceUrl(editor, value)) {
        return "该地址属于特殊内容源，请通过对应入口创建视频";
      }
      if (ReactEditor.isReadOnly(editor) || !canSetOrInsertNode(editor)) {
        return CANNOT_INSERT_HINT;
      }
    },
  });
  if (!url || ReactEditor.isReadOnly(editor)) return;
  try {
    if (!ReactEditor.toDOMNode(editor, editor).isConnected) return;
  } catch {
    return;
  }
  if (!insertMediaByUrl(editor, mediaType, url)) {
    notifier.warning(CANNOT_INSERT_HINT);
  }
};

/**
 * 组装某媒体类型的 slash 菜单二级项：
 * 固定 [本地上传, 网络地址] + 宿主注册的插入来源。
 */
export const getMediaInsertMenuItems = (
  editor: Editor | undefined,
  mediaType: MediaType
): IBlockPanelListItem[] => {
  if (!editor) {
    return [];
  }
  const label = MEDIA_TYPE_LABELS[mediaType];
  const items: IBlockPanelListItem[] = [
    {
      icon: Upload,
      title: "本地上传",
      keywords: ["上传", "upload", "本地", ...getMediaTypeKeywords(mediaType)],
      description: `从本地选择${label}文件上传`,
      onClick: () => openLocalMediaPicker(editor, mediaType),
    },
    {
      icon: Link,
      title: "网络地址",
      keywords: ["网络", "链接", "url", ...getMediaTypeKeywords(mediaType)],
      description: `通过${label}的网络地址插入`,
      onClick: () => void openMediaUrlInput(editor, mediaType),
    },
  ];

  const sources = editor.tryGetService?.(IMediaInsertSources) ?? [];
  sources
    .filter(source => source.mediaTypes.includes(mediaType) && (source.isAvailable?.() ?? true))
    .forEach(source => {
      items.push({
        icon: source.icon ?? Plus,
        title: source.label,
        keywords: [source.label, ...getMediaTypeKeywords(mediaType)],
        description: `通过${source.label}插入${label}`,
        onClick: () =>
          source.open({
            mediaType,
            onInsert: payloads => insertMediaPayloads(editor, mediaType, payloads),
          }),
      });
    });
  return items;
};

/** 视频网络地址是否属于注册的内容源（需走专门入口） */
export const isProviderSourceUrl = (editor: Editor, url: string) => {
  const providers = editor.tryGetService?.(IVideoContentProviders) ?? [];
  return providers.some(provider => provider.isSourceUrl?.(url));
};

export const insertMediaByUrl = (editor: Editor, mediaType: MediaType, url: string) => {
  return insertMediaPayloads(editor, mediaType, { src: url });
};

export { MEDIA_TYPE_LABELS };
