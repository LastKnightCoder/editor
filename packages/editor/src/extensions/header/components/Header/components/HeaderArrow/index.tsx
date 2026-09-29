import React from "react";
import { CaretRight } from "../../../../../../ui/CaretRight";
import classnames from "classnames";
import styles from "../../index.module.less";

interface HeaderArrowProps {
  collapsed: boolean;
  level: number;
  onClick: (e: React.MouseEvent) => void;
}

const HeaderArrow: React.FC<HeaderArrowProps> = ({ collapsed, level, onClick }) => {
  const arrowClass = classnames(styles.arrow, {
    [styles.show]: !collapsed,
    [styles.hide]: collapsed,
    [styles[`level${level}`]]: true,
  });

  return (
    <div className={arrowClass} onClick={onClick} contentEditable={false}>
      <CaretRight />
    </div>
  );
};

export default HeaderArrow;
