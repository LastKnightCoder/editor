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
  const dragRef = React.useRef<HTMLDivElement>(null);
  const dropRef = React.useRef<HTMLDivElement>(null);

  const { children, item } = props;

  const [, drag] = useDrag(() => ({
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

  const [{ isOver }, drop] = useDrop(() => ({
    accept: TYPE,
    canDrop: () => {
      return true;
    },
    collect: (monitor) => ({
      isOver: monitor.isOver(),
    })
  }));

  drag(dragRef);
  drop(dropRef);

  useEffect(() => {
    console.log('isOver', isOver);
  }, [isOver])

  return (
    <div className={classnames(styles.draggable)}>
      <div ref={dragRef} className={styles.handler} contentEditable={false} />
      <div ref={dropRef} className={classnames({ [styles.over]: isOver })}>{children}</div>
    </div>
  )
}

export default Draggable;