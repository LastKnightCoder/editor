import { ReactEditor, RenderElementProps, useSlate, useReadOnly } from "slate-react";
import type { ListItemElement } from "../../../types";
import { Editor, Node, Transforms } from "slate";
import classnames from "classnames";
import { useEffect, useRef, useState } from "react";
import { Popover } from "@tau/ui";
import IconPicker from "../IconPicker";
import useUploadResource from "../../../../hooks/useUploadResource";

import styles from "./index.module.less";

interface IListItemProps {
  attributes: RenderElementProps["attributes"];
  element: ListItemElement;
  children: React.ReactNode;
}

const ListItem = (props: IListItemProps) => {
  const { attributes, children, element } = props;
  const { isFold = false, allContent = element.children, icon, iconType, iconUrl } = element;
  const [isMultiline, setIsMultiline] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const listItemRef = useRef<HTMLLIElement>(null);

  const editor = useSlate();
  const readonly = useReadOnly();
  const uploadResource = useUploadResource();

  // Check if parent is bulleted-list
  const path = ReactEditor.findPath(editor, element);
  const parentPath = path.slice(0, -1);
  const parentNode = Node.get(editor, parentPath);
  const isBulletedList = parentNode && (parentNode as any).type === "bulleted-list";

  // 检测内容是否多行并测量第一行高度
  useEffect(() => {
    if (listItemRef.current) {
      const height = listItemRef.current.offsetHeight;

      // 找到下面的第一个 data-slate-node="element" children
      const firstLine = listItemRef.current.querySelector('[data-slate-node="element"]');
      const lineHeight = firstLine ? parseInt(getComputedStyle(firstLine).lineHeight) : 24;

      setIsMultiline(height > lineHeight * 2); // 如果高度超过2倍行高，认为是多行

      // 设置CSS变量，用于垂直线定位
      if (listItemRef.current) {
        listItemRef.current.style.setProperty("--first-line-height", `${lineHeight}px`);
      }
    }
  }, [children]);

  const handleFold = () => {
    // 设置 allContent 为 element.children
    // 设置 children 为 [element.children[0]]
    const path = ReactEditor.findPath(editor, element);
    Editor.withoutNormalizing(editor, () => {
      Transforms.delete(editor, {
        at: path,
      });
      Transforms.insertNodes(
        editor,
        {
          type: "list-item",
          isFold: true,
          allContent: element.children,
          children: [element.children[0]],
        },
        {
          at: path,
        }
      );
    });
  };

  const handleUnfold = () => {
    // 设置 foldContent 为 children
    // 设置 children 为 [foldContent, ...allContent.slice(1)]
    const path = ReactEditor.findPath(editor, element);
    Editor.withoutNormalizing(editor, () => {
      Transforms.delete(editor, {
        at: path,
      });
      Transforms.insertNodes(
        editor,
        {
          type: "list-item",
          allContent: element.allContent,
          isFold: false,
          // 折叠时可能对内容有修改，所以第一部分使用 children
          children: [...element.children, ...allContent.slice(1)],
        },
        {
          at: path,
        }
      );
    });
  };

  const handleOnClick = () => {
    if (isFold) {
      handleUnfold();
    } else {
      handleFold();
    }
  };

  const handleEmojiSelect = (emoji: string) => {
    if (readonly) return;
    const path = ReactEditor.findPath(editor, element);
    Transforms.setNodes(
      editor,
      {
        icon: emoji,
        iconType: "emoji",
        iconUrl: undefined,
      } as Partial<ListItemElement>,
      { at: path }
    );
    setPickerOpen(false);
  };

  const handleImageSelect = (url: string) => {
    if (readonly) return;
    const path = ReactEditor.findPath(editor, element);
    Transforms.setNodes(
      editor,
      {
        icon: undefined,
        iconType: "image",
        iconUrl: url,
      } as Partial<ListItemElement>,
      { at: path }
    );
    setPickerOpen(false);
  };

  const handleRemoveIcon = () => {
    if (readonly) return;
    const path = ReactEditor.findPath(editor, element);
    Transforms.setNodes(
      editor,
      {
        icon: undefined,
        iconType: undefined,
        iconUrl: undefined,
      } as Partial<ListItemElement>,
      { at: path }
    );
    setPickerOpen(false);
  };

  // 开合由 Popover 的触发器处理；这里只挡住冒泡，别让 Slate 把点击当成移动选区
  const handleBulletClick = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  const foldAble = element.children.length > 1;
  const hasIcon = iconType === "emoji" || iconType === "image";

  return (
    <li
      data-fold={isFold ? "fold" : "unfold"}
      data-multiline={isMultiline ? "true" : "false"}
      data-has-icon={hasIcon ? "true" : "false"}
      className={styles.listItem}
      {...attributes}
      ref={listItemRef}
    >
      {isBulletedList && (
        <Popover
          open={!readonly && pickerOpen}
          onOpenChange={setPickerOpen}
          arrow={false}
          placement="bottom-start"
          className="max-w-none overflow-hidden"
          trigger={
            <div
              contentEditable={false}
              className={classnames(styles.bulletArea, {
                [styles.clickable]: !readonly,
                [styles.hasCustomIcon]: hasIcon,
              })}
              onClick={handleBulletClick}
            >
              {hasIcon && (
                <div className={styles.customIcon}>
                  {iconType === "emoji" && <span className={styles.emojiIcon}>{icon}</span>}
                  {iconType === "image" && iconUrl && (
                    <img src={iconUrl} alt="icon" className={styles.imageIcon} />
                  )}
                </div>
              )}
            </div>
          }
        >
          <IconPicker
            onEmojiSelect={handleEmojiSelect}
            onImageSelect={handleImageSelect}
            onRemoveIcon={hasIcon ? handleRemoveIcon : undefined}
            uploadResource={uploadResource}
            hasIcon={hasIcon}
          />
        </Popover>
      )}
      <div
        className={classnames(styles.arrowContainer, {
          [styles.show]: isFold || foldAble,
        })}
      >
        <div
          contentEditable={false}
          className={classnames(styles.arrow, {
            [styles.fold]: isFold,
          })}
          onClick={handleOnClick}
        />
      </div>
      {children}
    </li>
  );
};

export default ListItem;
