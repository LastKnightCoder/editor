import { useMemo } from "react";
import { Editor, NodeEntry, Path, Transforms } from "slate";
import {
  ReactEditor,
  RenderElementProps,
  useSlate,
  useReadOnly,
  useSlateSelection,
} from "slate-react";
import If from "@/components/If";
import { DeleteOutlined } from "@ant-design/icons";

import { isLastChild } from "@/components/Editor/utils";
import classnames from "classnames";

import {
  MultiColumnContainerElement,
  MultiColumnItemElement,
} from "@/components/Editor/types";

import styles from "./index.module.less";

interface IMultiColumnItemProps {
  attributes: RenderElementProps["attributes"];
  element: MultiColumnItemElement;
  children: RenderElementProps["children"];
}

const MultiColumnItem = (props: IMultiColumnItemProps) => {
  const { attributes, element, children } = props;

  const editor = useSlate();
  const readOnly = useReadOnly();
  const selection = useSlateSelection();

  const isActive = useMemo(() => {
    const [columnItem] = Editor.nodes(editor, {
      match: (n) => n.type === "multi-column-item",
    });
    if (!columnItem) {
      return false;
    }
    const [, path] = columnItem as NodeEntry<MultiColumnContainerElement>;
    return Path.equals(ReactEditor.findPath(editor, element), path);
  }, [editor, selection, element]);

  const isLast = useMemo(() => {
    return isLastChild(editor, element);
  }, [editor, element]);

  const onDelete = () => {
    const path = ReactEditor.findPath(editor, element);
    Transforms.delete(editor, {
      at: path,
    });
  };

  return (
    <div
      className={classnames(styles.itemContainer, {
        [styles.notLast]: !isLast,
      })}
    >
      <If condition={isActive && !readOnly}>
        <div className={styles.delete} onClick={onDelete}>
          <DeleteOutlined />
        </div>
      </If>
      <div {...attributes}>{children}</div>
    </div>
  );
};

export default MultiColumnItem;
