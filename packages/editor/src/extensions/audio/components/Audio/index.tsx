import { IExtensionBaseProps } from "../../../../extensions/types";
import type { AudioElement } from "../../../../types";

import AddParagraph from "../../../../components/AddParagraph";
import EditorContextMenu from "../../../../components/EditorContextMenu";
import useDragAndDrop from "../../../../hooks/useDragAndDrop";
import { useDragHandlerMenu } from "../../../../hooks/useDragHandlerMenu";
import classnames from "classnames";
import styles from "./index.module.less";
import { MdDragIndicator } from "react-icons/md";
import { Spin } from "antd";
import { If } from "@tau/shared";
import { useAttrInput } from "../../../../hooks/useAttrInput";
import { ReactEditor, useReadOnly, useSlateStatic } from "slate-react";
import { Transforms } from "slate";
import { buildAudioMenuItems } from "../../utils/menuItems";

import { useEditorSlots } from "../../../../services";
import { openLocalMediaPicker } from "../../../../utils/mediaInsert";

const Audio = (props: IExtensionBaseProps<AudioElement>) => {
  const { attributes, element, children } = props;
  const editor = useSlateStatic();
  const readOnly = useReadOnly();

  const { Audio: AudioSlot } = useEditorSlots();

  // 标题就地编辑（输入法组词期间不提交，避免打断中文输入）
  const titleInput = useAttrInput(element.title, next => {
    const path = ReactEditor.findPath(editor, element);
    Transforms.setNodes(editor, { title: next }, { at: path });
  });
  const titleSlot = !readOnly ? (
    <input
      {...titleInput}
      placeholder="音频标题…"
      className="mb-1.5 w-full rounded-md bg-transparent px-1 py-0.5 text-sm font-medium text-gray-800 outline-none placeholder:font-normal placeholder:text-gray-400 focus:bg-gray-200/60 dark:text-zinc-200 dark:placeholder:text-zinc-500 dark:focus:bg-zinc-700/40"
    />
  ) : undefined;

  const { src, uploading } = element;
  const { drag, drop, isDragging, isBefore, isOverCurrent, canDrop, canDrag } = useDragAndDrop({
    element,
  });
  const { menuProps, dragHandlerProps } = useDragHandlerMenu({
    element,
    editor,
    buildMenuItems: params => buildAudioMenuItems(params),
  });

  // 遗留空音频元素的最小占位（正常流程经 slash 菜单直接创建已填充的元素）
  const renderNoContent = () => {
    if (readOnly) return null;
    return (
      <div className="flex items-center justify-center gap-[0.5em] rounded-[0.75em] border border-dashed border-gray-300 p-[1.5em] text-[0.875em] text-gray-500 dark:border-zinc-700 dark:text-zinc-400">
        {uploading ? (
          <span>音频上传中...</span>
        ) : (
          <>
            <span>空音频，</span>
            <button
              type="button"
              className="cursor-pointer border-none bg-transparent p-0 font-semibold text-[var(--th-btn-text)] underline-offset-2 hover:underline"
              onClick={() => openLocalMediaPicker(editor, "audio", element)}
            >
              选择文件
            </button>
            <span>上传</span>
          </>
        )}
      </div>
    );
  };

  return (
    <div
      ref={node => {
        drop(node);
      }}
      className={styles.container}
      suppressContentEditableWarning
      contentEditable={"false"}
    >
      <div {...attributes}>
        <Spin spinning={uploading}>
          {src ? (
            <AudioSlot
              src={src}
              controls
              label={element.title}
              labelSlot={titleSlot}
              className={classnames(styles.audio, {
                [styles.dragging]: isDragging,
                [styles.drop]: isOverCurrent && canDrop,
                [styles.before]: isBefore,
                [styles.after]: !isBefore,
              })}
            />
          ) : (
            <If condition={!src}>{renderNoContent()}</If>
          )}
        </Spin>
        {children}
        <div
          suppressContentEditableWarning
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
        <AddParagraph element={element} />
      </div>
    </div>
  );
};

export default Audio;
