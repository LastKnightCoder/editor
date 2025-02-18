import React, { memo } from 'react';
import If from "@/components/If";
import classnames from "classnames";

import styles from './index.module.less';
import { MdKeyboardArrowRight } from "react-icons/md";

interface ExpandListProps {
  active: boolean;
  showArrow?: boolean;
  title: string;
  expand: boolean;
  count?: React.ReactNode;
  titleIcon: React.ReactNode;
  children?: React.ReactNode;
  extra?: React.ReactNode;
  onClickTitle?: () => void;
  onClickArrow?: (e: React.MouseEvent) => void;
  className?: string;
  style?: React.CSSProperties;
}

const ExpandList = memo((props: ExpandListProps) => {
  const {
    active,
    title,
    expand,
    count,
    titleIcon,
    children,
    onClickTitle,
    onClickArrow,
    showArrow = true,
    extra,
  } = props;


  return (
    <div style={{ width: '100%' }}>
      <div className={classnames(styles.header, { [styles.active]: active })} onClick={onClickTitle}>
        <div className={styles.title}>
          {titleIcon}
          <span className={styles.text}>{title}</span>
          <div className={styles.count}>
            ({count})
          </div>
        </div>
        <If condition={showArrow}>
          <div
            className={classnames(styles.arrow, { [styles.open]: expand })}
            onClick={onClickArrow}
          >
            <MdKeyboardArrowRight/>
          </div>
        </If>
        {extra}
      </div>
      <If condition={!!children && expand}>
        {children}
      </If>
    </div>
  )
});

export default ExpandList