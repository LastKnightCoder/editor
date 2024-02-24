import { ReactEditor, RenderElementProps, useSlate } from "slate-react";
import { ListItemElement } from "@/components/Editor/types";
import { Editor, Transforms } from "slate";
import classnames from "classnames";

import styles from './index.module.less';

interface IListItemProps {
  attributes: RenderElementProps['attributes'];
  element: ListItemElement;
  children: React.ReactNode;
}

const ListItem = (props: IListItemProps) => {
  const { attributes, children, element } = props;
  const {
    isFold = false,
    allContent = element.children,
  } = element;

  const editor = useSlate();

  const handleFold = () => {
    // 设置 allContent 为 element.children
    // 设置 children 为 [element.children[0]]
    const path = ReactEditor.findPath(editor, element);
    Editor.withoutNormalizing(editor, () => {
      Transforms.delete(editor, {
        at: path,
      });
      Transforms.insertNodes(editor, {
        type: 'list-item',
        isFold: true,
        allContent: element.children,
        children: [element.children[0]],
      }, {
        at: path,
      });
    })
  }

  const handleUnfold = () => {
    // 设置 foldContent 为 children
    // 设置 children 为 [foldContent, ...allContent.slice(1)]
    const path = ReactEditor.findPath(editor, element);
    console.log([...element.children, ...allContent.slice(1)]);
    Editor.withoutNormalizing(editor, () => {
      Transforms.delete(editor, {
        at: path,
      })
      Transforms.insertNodes(editor, {
        type: 'list-item',
        allContent: element.allContent,
        isFold: false,
        // 折叠时可能对内容有修改，所以第一部分使用 children
        children: [...element.children, ...allContent.slice(1)],
      }, {
        at: path,
      });
    })
  }

  const handleOnClick = () => {
    if (isFold) {
      handleUnfold();
    } else {
      handleFold();
    }
  }

  const foldAble = element.children.length > 1;

  return (
    <li className={styles.listItem} {...attributes}>
      <div className={classnames(styles.arrowContainer, {
        [styles.show]: isFold || foldAble,
      })}>
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
  )
}

export default ListItem;