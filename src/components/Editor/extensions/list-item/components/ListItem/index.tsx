import { ReactEditor, RenderElementProps, useSlate } from "slate-react";
import { ListItemElement } from "@/components/Editor/types";
import { Editor, Transforms } from "slate";
import classnames from "classnames";
import { useEffect, useRef, useState } from "react";

import styles from "./index.module.less";

interface IListItemProps {
  attributes: RenderElementProps["attributes"];
  element: ListItemElement;
  children: React.ReactNode;
}

const ListItem = (props: IListItemProps) => {
  const { attributes, children, element } = props;
  const { isFold = false, allContent = element.children } = element;
  const [isMultiline, setIsMultiline] = useState(false);
  const listItemRef = useRef<HTMLLIElement>(null);

  const editor = useSlate();

  // 检测内容是否多行并测量第一行高度
  useEffect(() => {
    if (listItemRef.current) {
      const height = listItemRef.current.offsetHeight;

      // 找到下面的第一个 data-slate-node="element" children
      const firstLine = listItemRef.current.querySelector(
        '[data-slate-node="element"]',
      );
      const lineHeight = firstLine
        ? parseInt(getComputedStyle(firstLine).lineHeight)
        : 24;

      setIsMultiline(height > lineHeight * 2); // 如果高度超过2倍行高，认为是多行

      // 设置CSS变量，用于垂直线定位
      if (listItemRef.current) {
        listItemRef.current.style.setProperty(
          "--first-line-height",
          `${lineHeight * 1.5}px`,
        );
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
        },
      );
    });
  };

  const handleUnfold = () => {
    // 设置 foldContent 为 children
    // 设置 children 为 [foldContent, ...allContent.slice(1)]
    const path = ReactEditor.findPath(editor, element);
    console.log([...element.children, ...allContent.slice(1)]);
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
        },
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

  const foldAble = element.children.length > 1;

  return (
    <li
      data-fold={isFold ? "fold" : "unfold"}
      data-multiline={isMultiline ? "true" : "false"}
      className={styles.listItem}
      {...attributes}
      ref={listItemRef}
    >
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
