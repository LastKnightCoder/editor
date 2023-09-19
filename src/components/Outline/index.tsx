import React from "react";
import classnames from "classnames";

import For from "@/components/For";

import styles from './index.module.less';

interface IHeaderItem {
  title: string;
  level: number;
}

interface IOutlineProps {
  className?: string;
  style?: React.CSSProperties;
  headers: IHeaderItem[];
  onClick?: (index: number) => void;
}

const Outline = (props: IOutlineProps) => {
  const { headers, className, style, onClick } = props;

  return (
    <div className={classnames(styles.outlineContainer, className)} style={style}>
      <For data={headers} renderItem={(header, index) => (
        <div
          key={index}
          className={styles.header}
          data-level={header.level}
          onClick={() => {
            onClick?.(index);
          }}
        >
          {header.title}
        </div>
      )} />
    </div>
  )
}

export default Outline;