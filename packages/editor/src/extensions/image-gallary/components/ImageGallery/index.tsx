import { useEffect, useRef, useState } from "react";
import { useMemoizedFn } from "ahooks";
import { Transforms } from "slate";
import { ReactEditor, RenderElementProps, useReadOnly, useSlateStatic } from "slate-react";
import { Button, Dialog, DialogBody, cn } from "@tau/ui";
import {
  Columns3,
  GalleryHorizontalEnd,
  ImagePlus,
  Images,
  Maximize2,
  MoreHorizontal,
  Rows3,
} from "lucide-react";

import ImageGallerySetting, { ISetting } from "../ImageGallerySetting";
import { If } from "@tau/shared";
import AddParagraph from "../../../../components/AddParagraph";
import EditorContextMenu from "../../../../components/EditorContextMenu";
import type { ContextMenuItem } from "../../../../components/EditorContextMenu/types";
import { MediaToolbar, ToolbarButton, ToolbarGap } from "../../../../components/MediaToolbar";
import SwipeImageGallery from "../SwipeImageGallery";
import HorizontalImageGallery from "../HorizontalImageGallery";
import VerticalImageGallery from "../VerticalImageGallery";
import { resolveElementMenu } from "../../../../hooks/useDragHandlerMenu";
import useIsLastElement from "../../../../hooks/useIsLastElement";
import { useInheritedKit } from "../../../../kit/context";
import { openImageLightbox } from "../../../../stores";
import type { ImageGalleryElement } from "../../../../types";
import { EGalleryMode } from "../../../../constants";
import { MEDIA_SELECTED_OUTLINE_CLASS } from "../../../../utils/mediaFrameClasses";
import { shouldIgnoreBlockKey } from "../../../../utils/keyboardTarget";
import { useImageAppearance, type ImageAppearanceOption } from "../../../image/appearanceOption";
import { imageGalleryActionsMap } from "../../utils/menu";

interface IImageGalleryProps {
  attributes: RenderElementProps["attributes"];
  element: ImageGalleryElement;
  children: RenderElementProps["children"];
  appearance?: ImageAppearanceOption;
}

const LAYOUTS = [
  { mode: EGalleryMode.Horizontal, label: "横排", Icon: Rows3 },
  { mode: EGalleryMode.Vertical, label: "瀑布流", Icon: Columns3 },
  { mode: EGalleryMode.Inline, label: "轮播", Icon: GalleryHorizontalEnd },
] as const;

/**
 * 画廊块：与图片块同一套交互——悬停不出控件，单击选中、双击某张图进入灯箱（定位到这张）；
 * 选中后上方浮出属性条（布局 / 编辑图片 / 预览 / 更多）。只读下单击直接预览。
 */
const ImageGallery = (props: IImageGalleryProps) => {
  const { attributes, element, children, appearance: appearanceOption } = props;
  const {
    images,
    height = 200,
    mode,
    wider = false,
    columnCount = 3,
    margins = 8,
    lastRow = "nojustify",
    borderRadius,
    shadow,
  } = element;
  const isLast = useIsLastElement(element);

  const [settingModalOpen, setSettingModalOpen] = useState(false);
  const [setting, setSetting] = useState<ISetting>({
    mode,
    height,
    images,
    wider,
    columnCount,
    margins,
    lastRow,
    objectFit: element.objectFit,
    borderRadius,
    shadow,
  });

  const editor = useSlateStatic();
  const readOnly = useReadOnly();
  const kit = useInheritedKit();
  const appearance = useImageAppearance(appearanceOption);
  const effectiveBorderRadius = borderRadius ?? appearance?.borderRadius ?? "none";
  const effectiveShadow = shadow ?? appearance?.shadow ?? "none";

  const containerRef = useRef<HTMLDivElement>(null);
  const elementRef = useRef(element);
  elementRef.current = element;
  const [isSelected, setIsSelected] = useState(false);
  const [menu, setMenu] = useState<{
    position: { x: number; y: number };
    items: ContextMenuItem[];
  } | null>(null);
  const menuOpenRef = useRef(false);
  menuOpenRef.current = !!menu;

  const setProps = useMemoizedFn((patch: Partial<ImageGalleryElement>) => {
    try {
      Transforms.setNodes(editor, patch, { at: ReactEditor.findPath(editor, elementRef.current) });
    } catch {
      // 节点已被删除
    }
  });

  const openSettings = useMemoizedFn(() => {
    setSetting({
      mode,
      height,
      images,
      wider,
      columnCount,
      margins,
      lastRow,
      objectFit: element.objectFit,
      borderRadius,
      shadow,
    });
    setSettingModalOpen(true);
  });

  const preview = useMemoizedFn((index = 0) => openImageLightbox(editor, element, index));

  const deleteGallery = useMemoizedFn(() => {
    const path = ReactEditor.findPath(editor, element);
    Transforms.delete(editor, { at: path });
    Transforms.insertNodes(
      editor,
      { type: "paragraph", children: [{ type: "formatted", text: "" }] },
      { at: path, select: true }
    );
  });

  // 注册 actions 供菜单项调用
  useEffect(() => {
    imageGalleryActionsMap.set(element, { openSettings });
    return () => {
      imageGalleryActionsMap.delete(element);
    };
  }, [element, openSettings]);

  useEffect(() => {
    const handleDocMouseDown = (event: MouseEvent) => {
      if (menuOpenRef.current || settingModalOpen) return;
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsSelected(false);
      }
    };
    document.addEventListener("mousedown", handleDocMouseDown);
    return () => document.removeEventListener("mousedown", handleDocMouseDown);
  }, [settingModalOpen]);

  // 选中时的键盘：捕获阶段抢在编辑器之前处理
  useEffect(() => {
    if (!isSelected || readOnly || settingModalOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || shouldIgnoreBlockKey(event, containerRef.current))
        return;
      let handled = true;
      if (event.key === " ") preview();
      else if (event.key === "Enter") openSettings();
      else if (event.key === "Delete" || event.key === "Backspace") {
        setIsSelected(false);
        deleteGallery();
      } else if (event.key === "Escape") setIsSelected(false);
      else handled = false;
      if (handled) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [isSelected, readOnly, settingModalOpen, preview, openSettings, deleteGallery]);

  const handleItemClick = (index: number) => {
    if (readOnly) preview(index);
    else setIsSelected(true);
  };

  const onCancel = () => setSettingModalOpen(false);

  const onOk = () => {
    setSettingModalOpen(false);
    setProps({ ...setting });
  };

  const galleryProps = {
    items: images,
    borderRadius: effectiveBorderRadius,
    shadow: effectiveShadow,
    onItemClick: handleItemClick,
    onItemDoubleClick: preview,
  };

  return (
    <div className={cn("relative", wider && "w-[calc(100%+10em)] -translate-x-[5em]")}>
      <div {...attributes}>
        <If condition={images.length > 0}>
          <div ref={containerRef} contentEditable={false} className="relative">
            {!readOnly && isSelected && (
              <MediaToolbar label="画廊属性">
                {LAYOUTS.map(({ mode: value, label, Icon }) => (
                  <ToolbarButton
                    key={value}
                    title={label}
                    icon={<Icon size={15} />}
                    active={mode === value}
                    onClick={() => setProps({ mode: value })}
                  />
                ))}
                <ToolbarGap />
                <ToolbarButton
                  title="编辑图片"
                  shortcut="Enter"
                  label="编辑图片"
                  icon={<Images size={15} />}
                  onClick={openSettings}
                />
                <ToolbarButton
                  title="全屏预览"
                  shortcut="Space"
                  icon={<Maximize2 size={15} />}
                  onClick={() => preview()}
                />
                <ToolbarGap />
                <ToolbarButton
                  title="更多"
                  icon={<MoreHorizontal size={15} />}
                  onClick={event => {
                    const rect = event.currentTarget.getBoundingClientRect();
                    setMenu({
                      position: { x: rect.left, y: rect.bottom + 6 },
                      items: resolveElementMenu(kit, editor, elementRef.current),
                    });
                  }}
                />
              </MediaToolbar>
            )}
            <div
              className={cn(
                "rounded-[var(--tau-radius-sm)]",
                !readOnly && !isSelected && "cursor-pointer",
                isSelected && !readOnly && MEDIA_SELECTED_OUTLINE_CLASS
              )}
            >
              <If condition={mode === EGalleryMode.Horizontal}>
                <HorizontalImageGallery
                  {...galleryProps}
                  height={height}
                  margins={margins}
                  lastRow={lastRow}
                  onUpdateDimensions={updatedImages => setProps({ images: updatedImages })}
                />
              </If>
              <If condition={mode === EGalleryMode.Vertical}>
                <VerticalImageGallery
                  {...galleryProps}
                  columnCount={columnCount}
                  gap={margins}
                  onUpdateDimensions={updatedImages => setProps({ images: updatedImages })}
                />
              </If>
              <If condition={mode === EGalleryMode.Inline}>
                <SwipeImageGallery {...galleryProps} objectFit={element.objectFit} />
              </If>
            </div>
          </div>
        </If>
        <If condition={images.length === 0}>
          <button
            type="button"
            contentEditable={false}
            onClick={openSettings}
            className="text-tau-body flex w-full cursor-pointer items-center justify-center gap-2.5 rounded-[12px] border-none bg-[var(--ed-bg-surface)] py-10 text-[var(--ed-text-secondary)] shadow-[0_0_0_1px_var(--ed-border)] transition-colors hover:bg-[var(--ed-bg-hover)]"
          >
            <ImagePlus size={17} />
            添加图片到画廊
          </button>
        </If>
        {!(readOnly && isLast) && <AddParagraph element={element} />}
        <Dialog
          open={settingModalOpen}
          onOpenChange={next => !next && onCancel()}
          title="编辑画廊"
          width={720}
          footer={
            <>
              <Button variant="secondary" size="sm" onClick={onCancel}>
                取消
              </Button>
              <Button variant="primary" size="sm" onClick={onOk}>
                确定
              </Button>
            </>
          }
        >
          <DialogBody>
            <ImageGallerySetting setting={setting} onSettingChange={setSetting} />
          </DialogBody>
        </Dialog>
        {menu && (
          <EditorContextMenu
            visible
            position={menu.position}
            items={menu.items}
            readonly={readOnly}
            onClose={() => setMenu(null)}
          />
        )}
        {children}
      </div>
    </div>
  );
};

export default ImageGallery;
