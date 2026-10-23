import { IFileService, type FileService } from "@tau/shared/host-services";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Copy,
  Crop,
  Eye,
  ImageUp,
  Link2,
  Maximize2,
  Palette,
  Text,
} from "lucide-react";
import { Editor, Element, Transforms } from "slate";

import { type EditorCommand } from "@tau/editor/api";
import { type EditorMenuEntry, type EditorMenuContext } from "@tau/editor/api";
import { notifierOf, getCommandElementPath, captureElementSubmission } from "@tau/editor/api";
import { IMediaActions } from "../../../services/tokens";
import {
  type ImageBorderRadiusPreset,
  type ImageElement,
  type ImageShadowPreset,
} from "../../../types/index";
import { openImageLightbox } from "../../../stores";
import { imageActionsMap } from "./actionsMap";
import {
  IMAGE_BORDER_RADIUS_OPTIONS,
  IMAGE_SHADOW_OPTIONS,
  normalizeImageShadowPreset,
  type ImageAppearanceConfig,
} from "./appearance";

/** 图片块特有的菜单条目（删除等公共条目由内核默认菜单贡献，01 §5.4） */
const asImage = (element: Element | undefined): ImageElement | null =>
  element?.type === "image" ? (element as ImageElement) : null;

const findPath = (editor: Editor, element: ImageElement) => {
  return getCommandElementPath(editor, { element });
};

const resolveLocalPath = async (url: string, fileService?: FileService) => {
  if (!url.startsWith("~") || !fileService?.getHomeDir) {
    return null;
  }
  const homeDir = await fileService.getHomeDir();
  return `${homeDir}${url.slice(1)}`;
};

async function copyImageToClipboard(element: ImageElement, editor: Editor): Promise<void> {
  const message = notifierOf(editor);
  const fileService = editor.tryGetService(IFileService);
  try {
    const actions = imageActionsMap.get(element);
    if (actions?.getImageBlob) {
      try {
        const blob = await actions.getImageBlob();
        if (blob) {
          await navigator.clipboard.write([
            new ClipboardItem({
              [blob.type]: blob,
            }),
          ]);
          message.success("图片复制成功");
          return;
        }
      } catch (error) {
        console.warn("从 img 元素获取图片失败，尝试其他方式:", error);
      }
    }

    const url = element.url;
    const localPath = await resolveLocalPath(url, fileService);

    if (localPath) {
      await navigator.clipboard.writeText(localPath);
      message.success("图片路径复制成功");
      return;
    }

    if (url.startsWith("local://")) {
      const normalized = url.replace("local://", "");
      await navigator.clipboard.writeText(normalized);
      message.success("图片路径复制成功");
      return;
    }

    await navigator.clipboard.writeText(url);
    message.warning("无法直接复制图片，已复制图片链接");
  } catch (error) {
    console.error("复制图片失败:", error);
    message.error("复制图片失败");
  }
}

async function copyImageLink(url: string, editor: Editor): Promise<void> {
  const message = notifierOf(editor);
  const fileService = editor.tryGetService(IFileService);
  try {
    const localPath = await resolveLocalPath(url, fileService);

    if (localPath) {
      await navigator.clipboard.writeText(localPath);
      message.success("链接复制成功");
      return;
    }

    if (url.startsWith("local://")) {
      const normalized = url.replace("local://", "");
      await navigator.clipboard.writeText(normalized);
      message.success("链接复制成功");
      return;
    }

    await navigator.clipboard.writeText(url);
    message.success("链接复制成功");
  } catch (error) {
    console.error("复制链接失败:", error);
    message.error("复制链接失败");
  }
}

export const imageCommands: EditorCommand[] = [
  {
    id: "tau.image.fullscreen",
    title: "全屏预览",
    run: (editor, ctx) => {
      const element = asImage(ctx.element);
      if (!element) return;
      openImageLightbox(editor, element);
    },
  },
  {
    id: "tau.image.replace",
    title: "替换图片",
    run: (_editor, ctx) => {
      const element = asImage(ctx.element);
      if (!element) return;
      const capture = (ctx.payload as { capture?: boolean } | undefined)?.capture;
      imageActionsMap.get(element)?.replaceImage({ capture });
    },
  },
  {
    id: "tau.image.replace-url",
    title: "替换为网络图片",
    run: async (editor, ctx) => {
      const element = asImage(ctx.element);
      if (!element) return;
      const submission = captureElementSubmission(editor, {
        element,
        path: ctx.path,
        accept: current => current.url === element.url,
      });
      try {
        if (submission.check()) return;
        const url = await notifierOf(editor).prompt({
          signal: submission.signal,
          title: "替换为网络图片",
          placeholder: "https://example.com/image.png",
          confirmText: "替换",
          inputMode: "url",
        });
        if (!url?.trim()) return;
        // 换图保留宽度、对齐与说明，裁剪参数和原图尺寸随新图作废（同本地替换）
        submission.commit(({ path }) => {
          Transforms.setNodes(
            editor,
            {
              url: url.trim(),
              previewUrl: url.trim(),
              cropTransform: undefined,
              naturalWidth: undefined,
              naturalHeight: undefined,
            },
            { at: path }
          );
        });
      } finally {
        submission.dispose();
      }
    },
  },
  {
    id: "tau.image.edit-alt",
    title: "替代文本",
    run: async (editor, ctx) => {
      const element = asImage(ctx.element);
      if (!element) return;
      const submission = captureElementSubmission(editor, {
        element,
        path: ctx.path,
        accept: current => current.url === element.url && current.alt === element.alt,
      });
      try {
        if (submission.check()) return;
        const alt = await notifierOf(editor).prompt({
          signal: submission.signal,
          title: "替代文本",
          placeholder: "描述图片内容，供读屏与导出使用",
          defaultValue: element.alt ?? "",
        });
        if (alt == null) return;
        submission.commit(({ path }) => {
          Transforms.setNodes(editor, { alt }, { at: path });
        });
      } finally {
        submission.dispose();
      }
    },
  },
  {
    id: "tau.image.crop",
    title: "裁剪图片",
    run: (_editor, ctx) => {
      const element = asImage(ctx.element);
      if (!element) return;
      imageActionsMap.get(element)?.startCrop();
    },
  },
  {
    id: "tau.image.media-action",
    title: "媒体动作",
    run: (_editor, ctx) => {
      const element = asImage(ctx.element);
      const actionId = (ctx.payload as { actionId?: string })?.actionId;
      if (!element || !actionId) return;
      imageActionsMap.get(element)?.runMediaAction(actionId);
    },
  },
  {
    id: "tau.image.set-align",
    title: "设置对齐方式",
    run: (editor, ctx) => {
      const element = asImage(ctx.element);
      const align = (ctx.payload as { align?: ImageElement["align"] })?.align;
      if (!element || !align) return;
      const path = findPath(editor, element);
      if (path) Transforms.setNodes(editor, { align }, { at: path });
    },
  },
  {
    id: "tau.image.edit-description",
    title: "编辑说明",
    run: (_editor, ctx) => {
      const element = asImage(ctx.element);
      if (!element) return;
      imageActionsMap.get(element)?.showDescEditor();
    },
  },
  {
    id: "tau.image.set-appearance",
    title: "设置外观",
    run: (editor, ctx) => {
      const element = asImage(ctx.element);
      const value = ctx.payload as
        { borderRadius?: ImageBorderRadiusPreset; shadow?: ImageShadowPreset } | undefined;
      if (!element || !value) return;
      const path = findPath(editor, element);
      if (path) Transforms.setNodes(editor, value, { at: path });
    },
  },
  {
    id: "tau.image.copy-image",
    title: "复制图片",
    run: (editor, ctx) => {
      const element = asImage(ctx.element);
      if (!element) return;
      void copyImageToClipboard(element, editor);
    },
  },
  {
    id: "tau.image.copy-link",
    title: "复制链接",
    run: (editor, ctx) => {
      const element = asImage(ctx.element);
      if (!element) return;
      void copyImageLink(element.url, editor);
    },
  },
];

const alignIcon = (ctx: EditorMenuContext) => {
  const align = (ctx.element as ImageElement).align || "center";
  return align === "left" ? (
    <AlignLeft size={16} />
  ) : align === "right" ? (
    <AlignRight size={16} />
  ) : (
    <AlignCenter size={16} />
  );
};

const ALIGNMENTS = [
  { align: "left", label: "左对齐" },
  { align: "center", label: "居中" },
  { align: "right", label: "右对齐" },
] as const;

/** 菜单工厂：appearance 提供圆角/阴影的全局默认值（disabled 判断需要） */
export const buildImageMenuItems = (appearance?: ImageAppearanceConfig): EditorMenuEntry[] => [
  {
    id: "tau.image.fullscreen",
    title: "全屏预览",
    icon: <Maximize2 size={16} />,
    command: "tau.image.fullscreen",
  },
  {
    id: "tau.image.crop",
    title: "裁剪图片",
    icon: <Crop size={16} />,
    command: "tau.image.crop",
  },
  {
    id: "tau.image.set-align",
    title: "对齐方式",
    icon: alignIcon,
    children: ALIGNMENTS.map(({ align, label }) => ({
      id: `tau.image.set-align-${align}`,
      title: label,
      icon:
        align === "left" ? (
          <AlignLeft size={16} />
        ) : align === "right" ? (
          <AlignRight size={16} />
        ) : (
          <AlignCenter size={16} />
        ),
      command: "tau.image.set-align",
      payload: { align },
      disabled: ctx => ((ctx.element as ImageElement).align || "center") === align,
    })),
  },
  {
    id: "tau.image.edit-description",
    title: ctx => ((ctx.element as ImageElement).description ? "编辑说明" : "添加说明"),
    icon: <Text size={16} />,
    command: "tau.image.edit-description",
  },
  {
    id: "tau.image.edit-alt",
    title: "替代文本",
    icon: <Eye size={16} />,
    command: "tau.image.edit-alt",
  },
  {
    id: "tau.image.replace",
    title: "替换图片",
    icon: <ImageUp size={16} />,
    command: "tau.image.replace",
  },
  {
    id: "tau.image.set-appearance",
    title: "外观",
    icon: <Palette size={16} />,
    children: [
      {
        id: "tau.image.set-appearance-radius",
        title: "圆角",
        children: IMAGE_BORDER_RADIUS_OPTIONS.map(option => ({
          id: `tau.image.set-appearance-radius-${option.value}`,
          title: option.label,
          command: "tau.image.set-appearance",
          payload: { borderRadius: option.value },
          disabled: (ctx: EditorMenuContext) =>
            ((ctx.element as ImageElement).borderRadius ?? appearance?.borderRadius ?? "none") ===
            option.value,
        })),
      },
      {
        id: "tau.image.set-appearance-shadow",
        title: "阴影",
        children: IMAGE_SHADOW_OPTIONS.map(option => ({
          id: `tau.image.set-appearance-shadow-${option.value}`,
          title: option.label,
          command: "tau.image.set-appearance",
          payload: { shadow: option.value },
          disabled: (ctx: EditorMenuContext) =>
            normalizeImageShadowPreset(
              (ctx.element as ImageElement).shadow ?? appearance?.shadow
            ) === option.value,
        })),
      },
    ],
  },
  {
    id: "tau.image.copy-image",
    title: "复制图片",
    icon: <Copy size={16} />,
    command: "tau.image.copy-image",
  },
  {
    id: "tau.image.copy-link",
    title: "复制地址",
    icon: <Link2 size={16} />,
    command: "tau.image.copy-link",
  },
];

/** 宿主经 IMediaActions 注册的扩展动作（如 AI 识图）：服务里过滤可用的，动态生成条目 */
export const imageMediaActionEntries = (editor: Editor): EditorMenuEntry[] =>
  (editor.tryGetService(IMediaActions) ?? [])
    .filter(action => action.mediaTypes.includes("image") && (action.isAvailable?.() ?? true))
    .map(action => ({
      id: `tau.image.media-action-${action.id}`,
      title: action.label,
      icon: action.icon,
      command: "tau.image.media-action",
      payload: { actionId: action.id },
    }));
