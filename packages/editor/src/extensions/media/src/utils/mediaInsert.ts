import { Editor, Node, Path, Transforms } from "slate";
import { v4 as getUuid } from "uuid";
import { notifierOf, captureElementSubmission, captureInsertionSubmission } from "@tau/editor/api";
import { Link, Plus, Upload } from "lucide-react";

import { type IBlockPanelListItem } from "@tau/editor/api";
import { type MediaInsertPayload, type MediaType } from "../services/mediaProviders";
import { IMediaInsertSources, IVideoContentProviders } from "../services/tokens";
import { setOrInsertNode } from "@tau/editor/api";
import type { ImageElement } from "../types/element/image";
import type { VideoElement } from "../types/element/video";
import type { AudioElement } from "../types/element/audio";
import { beginMediaSubmission, mediaResourceSnapshot } from "./mediaSubmission";
import { uploadMedia } from "./uploadMedia";

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
let releasePicker: (() => void) | null = null;
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
  releasePicker?.();
  const snapshot = targetElement ? mediaResourceSnapshot(targetElement) : null;
  const target = targetElement
    ? captureElementSubmission(editor, {
        element: targetElement,
        accept: current => mediaResourceSnapshot(current) === snapshot,
      })
    : null;
  const anchor = targetElement ? null : captureInsertionSubmission(editor);
  const request = target ?? anchor;
  if (!request) return;
  if (request.check()) {
    request.dispose();
    options?.onComplete?.();
    return;
  }
  const input = acquirePickerInput();
  input.accept = `${mediaType}/*`;
  if (options?.capture) input.setAttribute("capture", "environment");
  else input.removeAttribute("capture");
  input.value = "";
  const dispose = () => {
    target?.dispose();
    anchor?.dispose();
    if (releasePicker === dispose) releasePicker = null;
  };
  releasePicker = dispose;
  input.oncancel = () => {
    dispose();
    options?.onComplete?.();
  };
  input.onchange = async () => {
    const file = input.files?.[0];
    try {
      if (!file || request.check()) return;
      if (target) {
        let submission: ReturnType<typeof beginMediaSubmission> = null;
        target.commit(({ element, path }) => {
          if (element.type === mediaType)
            submission = beginMediaSubmission(editor, element, { path });
        });
        await uploadMedia(editor, file, submission);
      } else if (anchor) {
        let submission: ReturnType<typeof beginMediaSubmission> = null;
        anchor.commit(({ range }) => {
          Transforms.select(editor, range);
          const path = setOrInsertNode(
            editor,
            buildMediaElement(mediaType, { src: "", title: file.name })
          );
          if (path)
            submission = beginMediaSubmission(editor, Node.get(editor, path) as AnyMediaElement, {
              path,
            });
        });
        await uploadMedia(editor, file, submission, "paragraph");
      }
    } finally {
      dispose();
      options?.onComplete?.();
    }
  };
  input.click();
};

const MEDIA_URL_PLACEHOLDERS: Record<MediaType, string> = {
  image: "https://example.com/image.png",
  video: "https://example.com/video.mp4",
  audio: "https://example.com/audio.mp3",
};

const CANNOT_INSERT_HINT = "当前选区无法插入，请将光标置于正文空行后重试";

/** 打开"网络地址"输入框并在光标处插入；输入框由提示服务承接（桌面默认 Dialog，mobile 底部面板） */
export const openMediaUrlInput = async (editor: Editor, mediaType: MediaType) => {
  const anchor = captureInsertionSubmission(editor);
  const notifier = notifierOf(editor);
  try {
    const reason = anchor.check();
    if (reason) {
      if (reason === "target-lost" || reason === "target-changed")
        notifier.warning(CANNOT_INSERT_HINT);
      return;
    }
    const url = await notifier.prompt({
      signal: anchor.signal,
      title: `插入网络${MEDIA_TYPE_LABELS[mediaType]}`,
      placeholder: MEDIA_URL_PLACEHOLDERS[mediaType],
      confirmText: "插入",
      inputMode: "url",
      validate: value => {
        if (mediaType === "video" && isProviderSourceUrl(editor, value)) {
          return "该地址属于特殊内容源，请通过对应入口创建视频";
        }
      },
    });
    if (!url) return;
    anchor.commit(({ range }) => {
      Transforms.select(editor, range);
      if (!insertMediaByUrl(editor, mediaType, url)) notifier.warning(CANNOT_INSERT_HINT);
    });
  } finally {
    anchor.dispose();
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

  const registered = editor.tryGetService?.(IMediaInsertSources) ?? [];
  const sources = typeof registered === "function" ? registered() : registered;
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
