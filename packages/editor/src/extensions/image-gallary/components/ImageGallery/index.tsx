import { useEffect, useMemo, useState } from "react";
import { Transforms } from "slate";
import {
  ReactEditor,
  RenderElementProps,
  useReadOnly,
  useSlateStatic,
} from "slate-react";
import classnames from "classnames";
import { PlusOutlined } from "@ant-design/icons";
import { CustomModal } from "@tau/shared";
import type { ThemeColors as CustomModalThemeColors } from "@tau/shared";

import useDragAndDrop from "../../../../hooks/useDragAndDrop";
import { useDragHandlerMenu } from "../../../../hooks/useDragHandlerMenu";
import ImageGallerySetting, { ISetting } from "../ImageGallerySetting";
import { If } from "@tau/shared";
import AddParagraph from "../../../../components/AddParagraph";
import SwipeImageGallery from "../SwipeImageGallery";
import HorizontalImageGallery from "../HorizontalImageGallery";
import VerticalImageGallery from "../VerticalImageGallery";
import useIsLastElement from "../../../../hooks/useIsLastElement";
import EditorContextMenu from "../../../../components/EditorContextMenu";
import type { ImageGalleryElement } from "../../../../types";
import { EGalleryMode } from "../../../../constants";
import useSettings from "../../../../hooks/useSettings";
import {
  buildImageGalleryMenuItems,
  imageGalleryActionsMap,
} from "../../utils/menuItems";

import styles from "./index.module.less";
import { MdDragIndicator } from "react-icons/md";

interface IImageGalleryProps {
  attributes: RenderElementProps["attributes"];
  element: ImageGalleryElement;
  children: RenderElementProps["children"];
}

const ImageGallery = (props: IImageGalleryProps) => {
  const { attributes, element, children } = props;
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
  const { drag, drop, isDragging, canDrag, canDrop, isBefore, isOverCurrent } =
    useDragAndDrop({
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
  const settingsService = useSettings();
  const [, setSettingVersion] = useState(0);
  const effectiveBorderRadius =
    borderRadius ??
    settingsService.get("appearance.image.borderRadius") ??
    "none";
  const effectiveShadow =
    shadow ?? settingsService.get("appearance.image.shadow") ?? "none";

  useEffect(() => {
    if (!settingsService.subscribe) {
      return;
    }

    return settingsService.subscribe(() => {
      setSettingVersion((prev) => prev + 1);
    });
  }, [settingsService]);

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

  // Get theme colors for the modal's confirm button
  const themeColors = useMemo<CustomModalThemeColors>(() => {
    const editorThemeColors = editor.services?.theme?.colors?.();
    if (editorThemeColors) {
      return {
        borderClass: editorThemeColors.borderClass,
        hoverClass: editorThemeColors.hoverClass,
        textClass: editorThemeColors.textClass,
        // Use buttonBg if available, otherwise use badgeBgClass as fallback
        buttonBg:
          (editorThemeColors as any).buttonBg || editorThemeColors.badgeBgClass,
        buttonTextClass: (editorThemeColors as any).buttonTextClass,
      };
    }
    // Default theme colors (indigo)
    return {
      borderClass: "border-gray-200 dark:border-slate-700",
      hoverClass: "hover:bg-gray-100 dark:hover:bg-zinc-800",
      textClass: "text-gray-700 dark:text-slate-300",
      buttonBg: "bg-indigo-500 hover:bg-indigo-600",
      buttonTextClass: "text-white",
    };
  }, [editor.services?.theme]);

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

  const onOk = async () => {
    setSettingModalOpen(false);

    // 对比图片变化，更新资源引用计数
    // @ts-ignore
    const contentId = editor.contentId;
    if (contentId) {
      const oldImages = images || [];
      const newImages = setting.images || [];

      // 找出新增的图片
      const addedImages = newImages.filter(
        (newImg) => !oldImages.some((oldImg) => oldImg.url === newImg.url),
      );

      // 找出删除的图片
      const removedImages = oldImages.filter(
        (oldImg) => !newImages.some((newImg) => newImg.url === oldImg.url),
      );

      // 处理新增的图片
      for (const image of addedImages) {
        if (image.url) {
          try {
            await editor.services?.resource.create({
              name: image.url.split("/").pop() || "未命名图片",
              path: image.url,
              type: "image",
              source: { type: "content", id: contentId },
            });
          } catch (e) {
            console.error("创建图片资源失败:", e);
          }
        }
      }

      // 处理删除的图片
      for (const image of removedImages) {
        if (image.url) {
          try {
            await editor.services?.resource.decrementRef(image.url);
          } catch (e) {
            console.error("减少图片资源引用失败:", e);
          }
        }
      }
    }

    const path = ReactEditor.findPath(editor, element);
    Transforms.setNodes(
      editor,
      {
        ...setting,
      },
      {
        at: path,
      },
    );
  };

  return (
    <div
      ref={(node) => {
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
                onUpdateDimensions={(updatedImages) => {
                  const path = ReactEditor.findPath(editor, element);
                  Transforms.setNodes(
                    editor,
                    { images: updatedImages },
                    { at: path },
                  );
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
                onUpdateDimensions={(updatedImages) => {
                  const path = ReactEditor.findPath(editor, element);
                  Transforms.setNodes(
                    editor,
                    { images: updatedImages },
                    { at: path },
                  );
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
          themeColors={themeColors}
        >
          <ImageGallerySetting setting={setting} onSettingChange={setSetting} />
        </CustomModal>
        {children}
      </div>
      <div
        contentEditable={false}
        ref={(node) => {
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
