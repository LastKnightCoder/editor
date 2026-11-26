import { mobileEditorTranslator, useMobileEditorI18n, EditorText } from "./i18n";
import { useRef, useState, type ReactNode } from "react";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Camera,
  Captions,
  CircleDot,
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
  Volume2,
} from "lucide-react";
import { openImageLightbox, openLocalMediaPicker } from "@tau/editor/extensions/media";
import type { Editor as SlateEditor } from "slate";

import { ActionSheet, type ActionSheetItem } from "../../../components/ActionSheet";
import { AccessoryButton, ContextChip, LabeledButton } from "./accessoryControls";
import type { MediaEditingContext, MediaElementType } from "./editingContext";
import {
  INLINE_IMAGE_SIZES,
  convertInlineImageToBlock,
  cycleMediaAlign,
  deleteMedia,
  editWebviewUrl,
  getInlineImageSize,
  getMediaAlign,
  placeCaretAfterMedia,
  renameAudio,
  runMediaCommand,
  setInlineImageSize,
} from "./mediaActions";
import type { MobileEditorToolbarController } from "./useMobileEditorToolbarController";
import { transcribeAudioBlock } from "../recording/transcription";
import { useMobilePlugins } from "../../../app/plugins/context";

const t = mobileEditorTranslator.t;

const ICON_SIZE = 18;
const ICON_STROKE = 2.1;
const MENU_ICON_SIZE = 18;

const MEDIA_LABELS: Record<MediaElementType, string> = {
  get image() {
    return t("media.image");
  },
  get "inline-image"() {
    return t("media.inlineImage");
  },
  get video() {
    return t("media.video");
  },
  get audio() {
    return t("media.audio");
  },
  get webview() {
    return t("block.web");
  },
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
  useMobileEditorI18n();
  const { controller, context, toggleMediaPanel } = options;
  const [sheet, setSheet] = useState<{ kind: MediaSheetKind; context: MediaEditingContext } | null>(
    null
  );
  const pendingRef = useRef<(() => void) | null>(null);

  const asrRegistry = useMobilePlugins()?.asr ?? null;
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
          get label() {
            return t("source.actions");
          },
          get desc() {
            return t("source.description");
          },
          icon: menuIcon(Layers),
          onClick: afterSheet(() => {
            controller.requestBlockSelection(target.path[0]);
          }),
        };

  const deleteItem = (target: MediaEditingContext): ActionSheetItem => ({
    get label() {
      return t("media.delete", { type: MEDIA_LABELS[target.mediaType] });
    },
    icon: menuIcon(Trash2),
    danger: true,
    onClick: afterSheet(() => run(editor => deleteMedia(editor, target))),
  });

  const buildMoreGroups = (target: MediaEditingContext): ActionSheetItem[][] => {
    const groups: ActionSheetItem[][] = [];
    if (target.mediaType === "image") {
      groups.push([
        {
          get label() {
            return t("media.viewImage");
          },
          icon: menuIcon(Maximize2),
          onClick: afterSheet(() =>
            run(editor => runMediaCommand(editor, target, "tau.image.fullscreen"))
          ),
        },
        {
          get label() {
            return t("media.alt");
          },
          icon: menuIcon(ScanText),
          get trailing() {
            return t((target.element as { alt?: string }).alt ? "media.set" : "media.unset");
          },
          onClick: afterSheet(() =>
            run(editor => runMediaCommand(editor, target, "tau.image.edit-alt"))
          ),
        },
        {
          get label() {
            return t("media.copyImage");
          },
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
          get label() {
            return t("media.album");
          },
          icon: menuIcon(Images),
          onClick: () => run(editor => runMediaCommand(editor, target, "tau.image.replace")),
        },
        {
          get label() {
            return t("media.camera");
          },
          icon: menuIcon(Camera),
          onClick: () =>
            run(editor => runMediaCommand(editor, target, "tau.image.replace", { capture: true })),
        },
        {
          get label() {
            return t("media.url");
          },
          icon: menuIcon(Link2),
          onClick: afterSheet(() =>
            run(editor => runMediaCommand(editor, target, "tau.image.replace-url"))
          ),
        },
      ];
    }
    const element = target.element as Parameters<typeof openLocalMediaPicker>[2];
    if (target.mediaType === "audio") {
      return [
        ...(controller.recordingEnabled
          ? [
              {
                get label() {
                  return t("media.recordAgain");
                },
                icon: menuIcon(CircleDot),
                onClick: afterSheet(() => controller.rerecordAudio(target.element, target.path)),
              },
            ]
          : []),
        {
          get label() {
            return t("media.selectFile");
          },
          icon: menuIcon(FileAudio),
          onClick: () => run(editor => openLocalMediaPicker(editor, "audio", element)),
        },
        {
          get label() {
            return t("media.generate");
          },
          icon: menuIcon(Volume2),
          onClick: afterSheet(() => openTtsForAudio(target)),
        },
      ];
    }
    return [
      {
        get label() {
          return t("media.album");
        },
        icon: menuIcon(Images),
        onClick: () => run(editor => openLocalMediaPicker(editor, "video", element)),
      },
      {
        get label() {
          return t("media.shoot");
        },
        icon: menuIcon(Camera),
        onClick: () =>
          run(editor => openLocalMediaPicker(editor, "video", element, { capture: true })),
      },
    ];
  };

  /** 生成音频带原文，重新生成时预填 */
  const openTtsForAudio = (target: MediaEditingContext) => {
    const { audioText } = target.element as { audioText?: string };
    controller.openTtsForAudio(target.element, target.path, audioText ?? "");
  };

  const renderAlignButton = (target: MediaEditingContext) => {
    const align = getMediaAlign(target);
    const AlignIcon = ALIGN_ICONS[align];
    return (
      <LabeledButton
        key="align"
        label={t("media.align")}
        icon={icon(AlignIcon)}
        onPress={() => run(editor => cycleMediaAlign(editor, target))}
      />
    );
  };

  const sizeButton = (
    <LabeledButton
      key="size"
      label={t("media.size")}
      icon={icon(Scaling)}
      active={controller.activePanel === "media"}
      onPress={toggleMediaPanel}
    />
  );

  const replaceButton = (target: MediaEditingContext) => (
    <LabeledButton
      key="replace"
      label={t("common.replace")}
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
            label={t("media.crop")}
            icon={icon(Crop)}
            onPress={() => run(editor => runMediaCommand(editor, target, "tau.image.crop"))}
          />,
          <LabeledButton
            key="caption"
            label={t("media.caption")}
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
          ...((target.element as { isFromGenerate?: boolean }).isFromGenerate
            ? [
                <LabeledButton
                  key="regenerate"
                  label={t("media.regenerate")}
                  icon={icon(RefreshCw)}
                  onPress={() => openTtsForAudio(target)}
                />,
              ]
            : []),
          <LabeledButton
            key="rename"
            label={t("media.rename")}
            icon={icon(PenLine)}
            onPress={() => run(editor => void renameAudio(editor, target))}
          />,
          replaceButton(target),
          <LabeledButton
            key="transcribe"
            label={t("media.transcribe")}
            icon={icon(Captions)}
            onPress={() =>
              run(editor => void transcribeAudioBlock(editor, asrRegistry, target.element))
            }
          />,
        ];
      case "inline-image": {
        const size = getInlineImageSize(target);
        return [
          ...INLINE_IMAGE_SIZES.map(option => (
            <AccessoryButton
              key={option.em}
              label={t("media.sizeLabel", { size: option.label })}
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
            label={t("common.view")}
            icon={icon(Maximize2)}
            onPress={() => run(editor => openImageLightbox(editor, target.element))}
          />,
          <LabeledButton
            key="to-block"
            label={t("media.toBlock")}
            icon={icon(RectangleHorizontal)}
            onPress={() => run(editor => convertInlineImageToBlock(editor, target))}
          />,
        ];
      }
      case "webview":
        return [
          <LabeledButton
            key="url"
            label={t("media.address")}
            icon={icon(Link2)}
            onPress={() => run(editor => void editWebviewUrl(editor, target))}
          />,
          <LabeledButton
            key="height"
            label={t("media.height")}
            icon={icon(MoveVertical)}
            active={controller.activePanel === "media"}
            onPress={toggleMediaPanel}
          />,
          <LabeledButton
            key="refresh"
            label={t("media.refresh")}
            icon={icon(RefreshCw)}
            onPress={() => run(editor => runMediaCommand(editor, target, "tau.webview.refresh"))}
          />,
          <LabeledButton
            key="fullscreen"
            label={t("media.fullscreen")}
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
      <ContextChip
        icon={<Captions size={14} strokeWidth={ICON_STROKE} />}
        label={t("media.captionTitle")}
      />
    );
    rightNode = (
      <AccessoryButton
        label={t("common.done")}
        className="text-accent-text px-[9px] text-[13.5px] font-semibold"
        onPress={finishCaption}
      >
        <EditorText message="common.done" />
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
            label={t("media.deleteInline")}
            onPress={() => run(editor => deleteMedia(editor, context))}
          >
            <Trash2 size={ICON_SIZE} strokeWidth={ICON_STROKE} />
          </AccessoryButton>
        ) : (
          <AccessoryButton
            label={t("media.menu", { type: MEDIA_LABELS[context.mediaType] })}
            onPress={() => openSheet("more", context)}
          >
            <Ellipsis size={ICON_SIZE} strokeWidth={ICON_STROKE} />
          </AccessoryButton>
        )}
        <AccessoryButton
          label={t("common.keyboard")}
          onPress={() => controller.focusAfterVoid(editor => placeCaretAfterMedia(editor, context))}
        >
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
        title={
          sheet
            ? t("media.replaceTitle", { type: MEDIA_LABELS[sheet.context.mediaType] })
            : undefined
        }
        groups={sheet?.kind === "replace" ? [buildReplaceItems(sheet.context)] : []}
        onClose={closeSheet}
      />
    </>
  );

  return { leftNode, middleNodes, rightNode, sheets, sheetOpen: sheet !== null };
}
