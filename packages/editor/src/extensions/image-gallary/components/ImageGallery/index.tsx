import { useEffect, useState } from "react";
import { Transforms } from "slate";
import { ReactEditor, RenderElementProps, useReadOnly, useSlateStatic } from "slate-react";
import { cn } from "@tau/ui";
import { Plus } from "lucide-react";
import { CustomModal } from "@tau/shared";

import ImageGallerySetting, { ISetting } from "../ImageGallerySetting";
import { EDITOR_MODAL_THEME } from "../../../../theme/modalTheme";
import { If } from "@tau/shared";
import AddParagraph from "../../../../components/AddParagraph";
import SwipeImageGallery from "../SwipeImageGallery";
import HorizontalImageGallery from "../HorizontalImageGallery";
import VerticalImageGallery from "../VerticalImageGallery";
import useIsLastElement from "../../../../hooks/useIsLastElement";
import type { ImageGalleryElement } from "../../../../types";
import { EGalleryMode } from "../../../../constants";
import { useImageAppearance, type ImageAppearanceOption } from "../../../image/appearanceOption";
import { imageGalleryActionsMap } from "../../utils/menu";

interface IImageGalleryProps {
  attributes: RenderElementProps["attributes"];
  element: ImageGalleryElement;
  children: RenderElementProps["children"];
  appearance?: ImageAppearanceOption;
}

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
  const appearance = useImageAppearance(appearanceOption);
  const effectiveBorderRadius = borderRadius ?? appearance?.borderRadius ?? "none";
  const effectiveShadow = shadow ?? appearance?.shadow ?? "none";

  // 注册 actions 供菜单项调用
  useEffect(() => {
    imageGalleryActionsMap.set(element, {
      openSettings: () => setSettingModalOpen(true),
    });
    return () => {
      imageGalleryActionsMap.delete(element);
    };
  }, [element]);

  const onCancel = () => {
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
    setSettingModalOpen(false);
  };

  const onOk = () => {
    setSettingModalOpen(false);

    const path = ReactEditor.findPath(editor, element);
    Transforms.setNodes(
      editor,
      {
        ...setting,
      },
      {
        at: path,
      }
    );
  };

  return (
    <div className={cn("relative", wider && "w-[calc(100%+10em)] -translate-x-[5em]")}>
      <div {...attributes}>
        <If condition={images.length > 0}>
          <div contentEditable={false}>
            <If condition={mode === EGalleryMode.Horizontal}>
              <HorizontalImageGallery
                items={images}
                height={height}
                margins={margins}
                lastRow={lastRow}
                borderRadius={effectiveBorderRadius}
                shadow={effectiveShadow}
                onUpdateDimensions={updatedImages => {
                  const path = ReactEditor.findPath(editor, element);
                  Transforms.setNodes(editor, { images: updatedImages }, { at: path });
                }}
              />
            </If>
            <If condition={mode === EGalleryMode.Vertical}>
              <VerticalImageGallery
                items={images}
                columnCount={columnCount}
                gap={margins}
                borderRadius={effectiveBorderRadius}
                shadow={effectiveShadow}
                onUpdateDimensions={updatedImages => {
                  const path = ReactEditor.findPath(editor, element);
                  Transforms.setNodes(editor, { images: updatedImages }, { at: path });
                }}
              />
            </If>
            <If condition={mode === EGalleryMode.Inline}>
              <SwipeImageGallery
                items={images}
                objectFit={element.objectFit}
                borderRadius={effectiveBorderRadius}
                shadow={effectiveShadow}
              />
            </If>
          </div>
        </If>
        <If condition={images.length === 0}>
          <div
            contentEditable={false}
            className="flex h-[10em] cursor-pointer items-center justify-center rounded-[0.5em] border-2 border-dashed border-[var(--ed-border)] bg-[var(--ed-bg-page)] text-[16px] hover:bg-[var(--ed-bg-hover)]"
            onClick={() => {
              setSettingModalOpen(true);
            }}
          >
            <div className="flex flex-col items-center gap-[0.625em]">
              <Plus size="1em" className="text-[1.5em]" />
              <div>上传图片</div>
            </div>
          </div>
        </If>
        {!(readOnly && isLast) && <AddParagraph element={element} />}
        <CustomModal
          width={720}
          open={settingModalOpen}
          onCancel={onCancel}
          onOk={onOk}
          themeColors={EDITOR_MODAL_THEME}
          bodyClassName="max-h-[calc(100vh-12rem)] overflow-y-auto"
        >
          <ImageGallerySetting setting={setting} onSettingChange={setSetting} />
        </CustomModal>
        {children}
      </div>
    </div>
  );
};

export default ImageGallery;
