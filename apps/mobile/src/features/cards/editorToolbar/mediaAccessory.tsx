import { useRef, useState, type ReactNode } from "react";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Camera,
  Captions,
  Copy,
  Crop,
  Ellipsis,
  Expand,
  FileAudio,
  Film,
  Globe,
  Image as ImageIcon,
  Images,
  Keyboard,
  Layers,
  Link2,
  Maximize2,
  Music,
  PenLine,
  RectangleHorizontal,
  RefreshCw,
  Replace,
  Scaling,
  ScanText,
  Trash2,
  MoveVertical,
} from "lucide-react";
import { openImageLightbox, openLocalMediaPicker } from "@tau/editor/extensions/media";
import type { Editor as SlateEditor } from "slate";

import { ActionSheet, type ActionSheetItem } from "../../../components/ActionSheet";
import { AccessoryButton, ContextChip } from "./accessoryControls";
import type { MediaEditingContext, MediaElementType } from "./editingContext";
import {
  INLINE_IMAGE_SIZES,
  convertInlineImageToBlock,
  cycleMediaAlign,
  deleteMedia,
  editWebviewUrl,
  getInlineImageSize,
  getMediaAlign,
  renameAudio,
  runMediaCommand,
  setInlineImageSize,
} from "./mediaActions";
import type { MobileEditorToolbarController } from "./useMobileEditorToolbarController";

const ICON_SIZE = 18;
const ICON_STROKE = 2.1;
const MENU_ICON_SIZE = 18;

const MEDIA_LABELS: Record<MediaElementType, string> = {
  image: "图片",
  "inline-image": "行内图片",
  video: "视频",
  audio: "音频",
  webview: "网页",
};

const MEDIA_ICONS: Record<MediaElementType, typeof ImageIcon> = {
  image: ImageIcon,
  "inline-image": ImageIcon,
  video: Film,
  audio: Music,
  webview: Globe,
};

const ALIGN_ICONS = { left: AlignLeft, center: AlignCenter, right: AlignRight } as const;

type MediaSheetKind = "more" | "replace";

/** 带文字标签的配件栏按钮：媒体操作单看图标不好认 */
function LabeledButton(props: {
  label: string;
  icon: ReactNode;
  active?: boolean;
  onPress: () => void;
}) {
  const { label, icon, active = false, onPress } = props;
  return (
    <AccessoryButton
      label={label}
      active={active}
      className="h-11 w-[46px] flex-col gap-px text-[9.5px] font-medium"
      onPress={onPress}
    >
      {icon}
      <span className="leading-none">{label}</span>
    </AccessoryButton>
  );
}

const icon = (Icon: typeof ImageIcon) => <Icon size={ICON_SIZE} strokeWidth={ICON_STROKE} />;
const menuIcon = (Icon: typeof ImageIcon) => <Icon size={MENU_ICON_SIZE} />;

type UseMediaAccessoryOptions = {
  controller: MobileEditorToolbarController;
  /** 面板未打开或打开的是媒体面板时的媒体上下文，否则为 null */
  context: MediaEditingContext | null;
  /** 打开 / 关闭媒体尺寸面板 */
  toggleMediaPanel: () => void;
};

/**
 * 配件栏媒体模式：选中媒体（触屏下点选）时左端类型标签、中段该类型的操作、右端「⋯」与「键盘」；
 * 图片说明编辑中只留「完成」。操作复用各扩展的命令，弹出选择器的项在点击内执行（保留用户手势），
 * 弹出输入框的项待动作面板退场后执行。
 */
export function useMediaAccessory(options: UseMediaAccessoryOptions) {
  const { controller, context, toggleMediaPanel } = options;
  const [sheet, setSheet] = useState<{ kind: MediaSheetKind; context: MediaEditingContext } | null>(
    null
  );
  const pendingRef = useRef<(() => void) | null>(null);

  const run = (fn: (editor: SlateEditor) => void) => controller.runMediaEdit(fn);

  const openSheet = (kind: MediaSheetKind, target: MediaEditingContext) => {
    // 下一拍再打开，避免本次点击落到 Sheet 遮罩上
    window.setTimeout(() => setSheet({ kind, context: target }), 0);
  };

  const closeSheet = () => {
    setSheet(null);
    const pending = pendingRef.current;
    pendingRef.current = null;
    pending?.();
  };

  /** 动作面板退场后再执行（输入框类，避免与退场中的面板抢返回仲裁） */
  const afterSheet = (fn: () => void) => () => {
    pendingRef.current = fn;
  };

  const blockActionItem = (target: MediaEditingContext): ActionSheetItem | null =>
    target.mediaType === "inline-image"
      ? null
      : {
          label: "块操作",
          desc: "移动、复制、转换",
          icon: menuIcon(Layers),
          onClick: afterSheet(() => {
            controller.requestBlockSelection(target.path[0]);
          }),
        };

  const deleteItem = (target: MediaEditingContext): ActionSheetItem => ({
    label: `删除${MEDIA_LABELS[target.mediaType]}`,
    icon: menuIcon(Trash2),
    danger: true,
    onClick: afterSheet(() => run(editor => deleteMedia(editor, target))),
  });

  const buildMoreGroups = (target: MediaEditingContext): ActionSheetItem[][] => {
    const groups: ActionSheetItem[][] = [];
    if (target.mediaType === "image") {
      groups.push([
        {
          label: "查看大图",
          icon: menuIcon(Maximize2),
          onClick: afterSheet(() =>
            run(editor => runMediaCommand(editor, target, "tau.image.fullscreen"))
          ),
        },
        {
          label: "替代文本",
          icon: menuIcon(ScanText),
          trailing: (target.element as { alt?: string }).alt ? "已设置" : "未设置",
          onClick: afterSheet(() =>
            run(editor => runMediaCommand(editor, target, "tau.image.edit-alt"))
          ),
        },
        {
          label: "复制图片",
          icon: menuIcon(Copy),
          onClick: () => run(editor => runMediaCommand(editor, target, "tau.image.copy-image")),
        },
      ]);
    }
    const blockItem = blockActionItem(target);
    groups.push([...(blockItem ? [blockItem] : []), deleteItem(target)]);
    return groups;
  };

  const buildReplaceItems = (target: MediaEditingContext): ActionSheetItem[] => {
    if (target.mediaType === "image") {
      return [
        {
          label: "从相册选择",
          icon: menuIcon(Images),
          onClick: () => run(editor => runMediaCommand(editor, target, "tau.image.replace")),
        },
        {
          label: "拍照",
          icon: menuIcon(Camera),
          onClick: () =>
            run(editor => runMediaCommand(editor, target, "tau.image.replace", { capture: true })),
        },
        {
          label: "网络地址",
          icon: menuIcon(Link2),
          onClick: afterSheet(() =>
            run(editor => runMediaCommand(editor, target, "tau.image.replace-url"))
          ),
        },
      ];
    }
    const mediaType = target.mediaType === "video" ? "video" : "audio";
    const element = target.element as Parameters<typeof openLocalMediaPicker>[2];
    return [
      {
        label: mediaType === "video" ? "从相册选择" : "选择文件",
        icon: menuIcon(mediaType === "video" ? Images : FileAudio),
        onClick: () => run(editor => openLocalMediaPicker(editor, mediaType, element)),
      },
      ...(mediaType === "video"
        ? [
            {
              label: "拍摄",
              icon: menuIcon(Camera),
              onClick: () =>
                run(editor => openLocalMediaPicker(editor, "video", element, { capture: true })),
            },
          ]
        : []),
    ];
  };

  const renderAlignButton = (target: MediaEditingContext) => {
    const align = getMediaAlign(target);
    const AlignIcon = ALIGN_ICONS[align];
    return (
      <LabeledButton
        key="align"
        label="对齐"
        icon={icon(AlignIcon)}
        onPress={() => run(editor => cycleMediaAlign(editor, target))}
      />
    );
  };

  const sizeButton = (
    <LabeledButton
      key="size"
      label="尺寸"
      icon={icon(Scaling)}
      active={controller.activePanel === "media"}
      onPress={toggleMediaPanel}
    />
  );

  const replaceButton = (target: MediaEditingContext) => (
    <LabeledButton
      key="replace"
      label="替换"
      icon={icon(Replace)}
      onPress={() => openSheet("replace", target)}
    />
  );

  const buildMiddle = (target: MediaEditingContext): ReactNode[] => {
    switch (target.mediaType) {
      case "image":
        return [
          sizeButton,
          renderAlignButton(target),
          <LabeledButton
            key="crop"
            label="裁剪"
            icon={icon(Crop)}
            onPress={() => run(editor => runMediaCommand(editor, target, "tau.image.crop"))}
          />,
          <LabeledButton
            key="caption"
            label="说明"
            icon={icon(Captions)}
            onPress={() =>
              run(editor => runMediaCommand(editor, target, "tau.image.edit-description"))
            }
          />,
          replaceButton(target),
        ];
      case "video":
        return [sizeButton, renderAlignButton(target), replaceButton(target)];
      case "audio":
        return [
          <LabeledButton
            key="rename"
            label="重命名"
            icon={icon(PenLine)}
            onPress={() => run(editor => void renameAudio(editor, target))}
          />,
          replaceButton(target),
        ];
      case "inline-image": {
        const size = getInlineImageSize(target);
        return [
          ...INLINE_IMAGE_SIZES.map(option => (
            <AccessoryButton
              key={option.label}
              label={`${option.label}尺寸`}
              active={size === option.em}
              className="px-[9px] text-[13.5px] font-semibold"
              onPress={() => run(editor => setInlineImageSize(editor, target, option.em))}
            >
              {option.label}
            </AccessoryButton>
          )),
          <span key="sep" aria-hidden="true" className="bg-line-1 mx-1 h-[22px] w-px shrink-0" />,
          <LabeledButton
            key="view"
            label="查看"
            icon={icon(Maximize2)}
            onPress={() => run(editor => openImageLightbox(editor, target.element))}
          />,
          <LabeledButton
            key="to-block"
            label="转为大图"
            icon={icon(RectangleHorizontal)}
            onPress={() => run(editor => convertInlineImageToBlock(editor, target))}
          />,
        ];
      }
      case "webview":
        return [
          <LabeledButton
            key="url"
            label="地址"
            icon={icon(Link2)}
            onPress={() => run(editor => void editWebviewUrl(editor, target))}
          />,
          <LabeledButton
            key="height"
            label="高度"
            icon={icon(MoveVertical)}
            active={controller.activePanel === "media"}
            onPress={toggleMediaPanel}
          />,
          <LabeledButton
            key="refresh"
            label="刷新"
            icon={icon(RefreshCw)}
            onPress={() => run(editor => runMediaCommand(editor, target, "tau.webview.refresh"))}
          />,
          <LabeledButton
            key="fullscreen"
            label="全屏"
            icon={icon(Expand)}
            onPress={() => run(editor => runMediaCommand(editor, target, "tau.webview.fullscreen"))}
          />,
        ];
    }
  };

  const finishCaption = () => {
    const active = document.activeElement;
    if (active instanceof HTMLElement) active.blur();
  };

  let leftNode: ReactNode = null;
  let middleNodes: ReactNode[] = [];
  let rightNode: ReactNode = null;
  if (context?.captionEditing) {
    leftNode = (
      <ContextChip icon={<Captions size={14} strokeWidth={ICON_STROKE} />} label="图片说明" />
    );
    rightNode = (
      <AccessoryButton
        label="完成"
        className="text-accent-text px-[9px] text-[13.5px] font-semibold"
        onPress={finishCaption}
      >
        完成
      </AccessoryButton>
    );
  } else if (context) {
    const TypeIcon = MEDIA_ICONS[context.mediaType];
    leftNode = (
      <ContextChip
        icon={<TypeIcon size={14} strokeWidth={ICON_STROKE} />}
        label={MEDIA_LABELS[context.mediaType]}
      />
    );
    middleNodes = buildMiddle(context);
    rightNode = (
      <>
        {context.mediaType === "inline-image" ? (
          <AccessoryButton
            label="删除行内图片"
            onPress={() => run(editor => deleteMedia(editor, context))}
          >
            <Trash2 size={ICON_SIZE} strokeWidth={ICON_STROKE} />
          </AccessoryButton>
        ) : (
          <AccessoryButton
            label={`${MEDIA_LABELS[context.mediaType]}菜单`}
            onPress={() => openSheet("more", context)}
          >
            <Ellipsis size={ICON_SIZE} strokeWidth={ICON_STROKE} />
          </AccessoryButton>
        )}
        <AccessoryButton label="键盘" onPress={() => controller.focusAfterMedia(context)}>
          <Keyboard size={ICON_SIZE} strokeWidth={ICON_STROKE} />
        </AccessoryButton>
      </>
    );
  }

  const sheets = (
    <>
      <ActionSheet
        open={sheet?.kind === "more"}
        title={sheet ? MEDIA_LABELS[sheet.context.mediaType] : undefined}
        groups={sheet?.kind === "more" ? buildMoreGroups(sheet.context) : []}
        onClose={closeSheet}
      />
      <ActionSheet
        open={sheet?.kind === "replace"}
        title={sheet ? `替换${MEDIA_LABELS[sheet.context.mediaType]}` : undefined}
        groups={sheet?.kind === "replace" ? [buildReplaceItems(sheet.context)] : []}
        onClose={closeSheet}
      />
    </>
  );

  return { leftNode, middleNodes, rightNode, sheets, sheetOpen: sheet !== null };
}
