import React, {useEffect} from "react";
import { useDrag, useDrop } from "react-dnd";
import {ReactEditor, RenderElementProps, useSlate} from "slate-react";
import classnames from "classnames";

import styles from './index.module.less';

const TYPE = 'CARD';

interface DraggableProps {
  item: RenderElementProps['element'];
}

const Draggable: React.FC<React.PropsWithChildren<DraggableProps>> = (props) => {
  const { children, item } = props;

  const [{ isDragging }, drag, preview] = useDrag(() => ({
    type: TYPE,
    item,
    end: (item: RenderElementProps['element'], monitor) => {
      const dropItem = monitor.getDropResult() as RenderElementProps['element'];
      if (!dropItem) return;
      const sourcePath = ReactEditor.findPath(editor, item);
      const targetPath = ReactEditor.findPath(editor, dropItem);
      console.log(sourcePath, targetPath);
      console.log(monitor);
    },
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    })
  }));

  const editor = useSlate();

  const [{ isOver, canDrop }, drop] = useDrop(() => ({
    accept: TYPE,
    drop: (dropItem: RenderElementProps['element']) => {
      return dropItem;
    },
    collect: (monitor) => ({
      isOver: monitor.isOver(),
      canDrop: monitor.canDrop(),
    })
  }));

  useEffect(() => {
    console.log('Draggable', isDragging, isOver);
  }, [isDragging, isOver]);

  return (
    <div className={classnames(styles.draggable, { [styles.over]: isOver, [styles.canDrop]: canDrop })}>
      <div ref={drag} className={styles.handler} contentEditable={false} />
      <div ref={(node) => preview(drop(node))}>{children}</div>
    </div>
  )
}

export default Draggable;