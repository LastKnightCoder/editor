import React from "react";
import styles from "../../index.module.less";
import HeaderArrow from "../HeaderArrow";
import { RenderElementProps } from "slate-react";

interface HeaderContentProps {
  level: number;
  collapsed: boolean;
  toggleCollapse: (e: React.MouseEvent) => void;
  children: React.ReactNode;
  attributes: RenderElementProps["attributes"];
}

const HeaderContent: React.FC<HeaderContentProps> = ({
  level,
  collapsed,
  toggleCollapse,
  children,
  attributes,
}) => {
  const renderHeader = () => {
    const arrow = (
      <HeaderArrow
        collapsed={collapsed}
        level={level}
        onClick={toggleCollapse}
      />
    );

    switch (level) {
      case 1:
        return (
          <h1 className={styles.h1}>
            {children}
            {arrow}
          </h1>
        );
      case 2:
        return (
          <h2 className={styles.h2}>
            {children}
            {arrow}
          </h2>
        );
      case 3:
        return (
          <h3 className={styles.h3}>
            {children}
            {arrow}
          </h3>
        );
      case 4:
        return (
          <h4 className={styles.h4}>
            {children}
            {arrow}
          </h4>
        );
      case 5:
        return (
          <h5 className={styles.h5}>
            {children}
            {arrow}
          </h5>
        );
      case 6:
        return (
          <h6 className={styles.h6}>
            {children}
            {arrow}
          </h6>
        );
      default:
        return (
          <h1 className={styles.h1}>
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
