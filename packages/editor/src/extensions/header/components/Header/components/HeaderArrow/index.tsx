import React from "react";
import { CaretRightOutlined } from "@ant-design/icons";
import classnames from "classnames";
import styles from "../../index.module.less";

interface HeaderArrowProps {
  collapsed: boolean;
  level: number;
  onClick: (e: React.MouseEvent) => void;
}

const HeaderArrow: React.FC<HeaderArrowProps> = ({
  collapsed,
  level,
  onClick,
}) => {
  const arrowClass = classnames(styles.arrow, {
    [styles.show]: !collapsed,
    [styles.hide]: collapsed,
    [styles[`level${level}`]]: true,
  });

  return (
    <div className={arrowClass} onClick={onClick} contentEditable={false}>
      <CaretRightOutlined />
    </div>
  );
};

export default HeaderArrow;
