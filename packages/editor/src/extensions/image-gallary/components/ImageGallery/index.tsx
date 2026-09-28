import { useEffect, useState } from "react";
import { Transforms } from "slate";
import { ReactEditor, RenderElementProps, useReadOnly, useSlateStatic } from "slate-react";
import classnames from "classnames";
import { PlusOutlined } from "@ant-design/icons";
import { CustomModal } from "@tau/shared";

import useDragAndDrop from "../../../../hooks/useDragAndDrop";
import { useDragHandlerMenu } from "../../../../hooks/useDragHandlerMenu";
import ImageGallerySetting, { ISetting } from "../ImageGallerySetting";
import { EDITOR_MODAL_THEME } from "../../../../theme/modalTheme";
import { If } from "@tau/shared";
import AddParagraph from "../../../../components/AddParagraph";
import SwipeImageGallery from "../SwipeImageGallery";
import HorizontalImageGallery from "../HorizontalImageGallery";
import VerticalImageGallery from "../VerticalImageGallery";
import useIsLastElement from "../../../../hooks/useIsLastElement";
import EditorContextMenu from "../../../../components/EditorContextMenu";
import type { ImageGalleryElement } from "../../../../types";
import { EGalleryMode } from "../../../../constants";
import { useImageAppearance, type ImageAppearanceOption } from "../../../image/appearanceOption";
import { buildImageGalleryMenuItems, imageGalleryActionsMap } from "../../utils/menuItems";

import styles from "./index.module.less";
import { MdDragIndicator } from "react-icons/md";

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
  const { drag, drop, isDragging, canDrag, canDrop, isBefore, isOverCurrent } = useDragAndDrop({
    element,
  });

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

  // 拖拽菜单
  const { menuProps, dragHandlerProps } = useDragHandlerMenu({
    element,
    editor,
    buildMenuItems: buildImageGalleryMenuItems,
  });

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
    <div
      ref={node => {
        drop(node);
      }}
      className={classnames(styles.imageGalleryContainer, {
        [styles.wider]: wider,
        [styles.dragging]: isDragging,
        [styles.drop]: isOverCurrent && canDrop,
        [styles.before]: isBefore,
        [styles.after]: !isBefore,
      })}
    >
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
            className={styles.emptySetting}
            onClick={() => {
              setSettingModalOpen(true);
            }}
          >
            <div className={styles.uploadTips}>
              <PlusOutlined className={styles.icon} />
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
      <div
        contentEditable={false}
        ref={node => {
          drag(node);
        }}
        className={classnames(styles.dragHandler, {
          [styles.canDrag]: canDrag,
        })}
        onClick={dragHandlerProps.onClick}
      >
        <MdDragIndicator className={styles.icon} />
      </div>
      <EditorContextMenu {...menuProps} readonly={readOnly} />
    </div>
  );
};

export default ImageGallery;
