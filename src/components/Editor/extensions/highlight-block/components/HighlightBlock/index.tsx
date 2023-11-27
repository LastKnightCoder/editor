import { useMemo } from "react";
import { Editor, NodeEntry, Path, Transforms } from "slate";
import { ReactEditor, RenderElementProps, useSlate, useSlateSelection, useReadOnly } from "slate-react";
import { HighlightBlockElement, Color } from "@/components/Editor/types";
import useDragAndDrop from "@/components/Editor/hooks/useDragAndDrop.ts";

import useTheme from "@/hooks/useTheme.ts";

import HighlightBlockPure from '../HighlightBlockPure';
import SelectColor from "../SelectColor";
import If from "@/components/If";
import AddParagraph from "@/components/Editor/components/AddParagraph";

import { colors } from '../../configs.ts';

import styles from './index.module.less';
import classnames from "classnames";
import {MdDragIndicator} from "react-icons/md";

interface IHighBlockProps {
  attributes: RenderElementProps['attributes'];
  element: HighlightBlockElement;
  children: RenderElementProps['children'];
}

const HighlightBlock = (props: IHighBlockProps) => {
  const { attributes, element, children } = props;
  const { color } = element;

  const { isDark } = useTheme();
  const editor = useSlate();
  const selection = useSlateSelection();
  const readOnly = useReadOnly();
  const {
    drag,
    drop,
    isDragging,
    canDrag,
    canDrop,
    isBefore,
    isOverCurrent,
  } = useDragAndDrop({
    element,
  })

  const isActive = useMemo(() => {
    const [match] = Editor.nodes(editor, {
      match: n => n.type === 'highlight-block'
    });
    if (!match) {
      return false;
    }
    const [, path] = match as NodeEntry<HighlightBlockElement>;
    return Path.equals(ReactEditor.findPath(editor, element), path);
  }, [editor, selection, element]);

  const themeColor = colors[color];
  const { backgroundColor, borderColor  } = isDark ? themeColor.dark : themeColor.light;

  const onSelectColor = (color: Color) => {
    const path = ReactEditor.findPath(editor, element);
    Transforms.setNodes(editor, {
      color
    }, {
      at: path
    })
  }

  return (
    <div ref={drop} className={styles.container}>
      <If condition={isActive && !readOnly}>
        <div className={styles.selectColorContainer} contentEditable={false}>
          <SelectColor activeColor={color} onSelectColor={onSelectColor} />
        </div>
      </If>
      <div contentEditable={false} ref={drag} className={classnames(styles.dragHandler, {[styles.canDrag]: canDrag})}>
        <MdDragIndicator className={styles.icon}/>
      </div>
      <div {...attributes} className={classnames(styles.highlightBlock, {
        [styles.dragging]: isDragging,
        [styles.drop]: isOverCurrent && canDrop,
        [styles.before]: isBefore,
        [styles.after]: !isBefore,
      })}>
        <HighlightBlockPure
          backgroundColor={backgroundColor}
          borderColor={borderColor}
        >
          {children}
        </HighlightBlockPure>
      </div>
      <AddParagraph element={element} />
    </div>
  )
}

export default HighlightBlock;