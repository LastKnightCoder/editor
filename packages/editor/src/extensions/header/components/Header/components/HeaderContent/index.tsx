import React from "react";
import styles from "../../index.module.less";
import HeaderArrow from "../HeaderArrow";
import DragHandle from "../DragHandle";
import { RenderElementProps } from "slate-react";
import { ConnectDragSource } from "react-dnd";

interface HeaderContentProps {
  level: number;
  collapsed: boolean;
  toggleCollapse?: (e: React.MouseEvent) => void;
  children: React.ReactNode;
  attributes: RenderElementProps["attributes"];
  dragRef: ConnectDragSource;
  canDrag: boolean;
}

const HeaderContent: React.FC<HeaderContentProps> = ({
  level,
  collapsed,
  toggleCollapse,
  children,
  attributes,
  dragRef,
  canDrag,
}) => {
  const renderHeader = () => {
    // 只有当 toggleCollapse 存在时才显示箭头
    const arrow = toggleCollapse ? (
      <HeaderArrow
        collapsed={collapsed}
        level={level}
        onClick={toggleCollapse}
      />
    ) : null;
    const dragHandle = <DragHandle dragRef={dragRef} canDrag={canDrag} />;

    switch (level) {
      case 1:
        return (
          <h1 className={styles.h1}>
            {dragHandle}
            {children}
            {arrow}
          </h1>
        );
      case 2:
        return (
          <h2 className={styles.h2}>
            {dragHandle}
            {children}
            {arrow}
          </h2>
        );
      case 3:
        return (
          <h3 className={styles.h3}>
            {dragHandle}
            {children}
            {arrow}
          </h3>
        );
      case 4:
        return (
          <h4 className={styles.h4}>
            {dragHandle}
            {children}
            {arrow}
          </h4>
        );
      case 5:
        return (
          <h5 className={styles.h5}>
            {dragHandle}
            {children}
            {arrow}
          </h5>
        );
      case 6:
        return (
          <h6 className={styles.h6}>
            {dragHandle}
            {children}
            {arrow}
          </h6>
        );
      default:
        return (
          <h1 className={styles.h1}>
            {dragHandle}
            {children}
            {arrow}
          </h1>
        );
    }
  };

  return (
    <div className={styles.headerContent} {...attributes}>
      {renderHeader()}
    </div>
  );
};

export default HeaderContent;
