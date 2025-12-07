import React, { useRef } from "react";
import useLoadMore from "@/hooks/useLoadMore";
import If from "@/components/If";

import styles from "./index.module.less";

interface ILoadMoreComponentProps {
  onLoadMore: () => Promise<void>;
  children?: React.ReactNode;
  showLoader?: boolean;
}

const LoadMoreComponent = (props: ILoadMoreComponentProps) => {
  const { onLoadMore, children, showLoader = true } = props;
  const loaderRef = useRef<HTMLDivElement>(null);

  useLoadMore(loaderRef, onLoadMore, showLoader);

  return (
    <>
      {children}
      <If condition={showLoader}>
        <div ref={loaderRef} className={styles.loader} />
      </If>
    </>
  );
};

export default LoadMoreComponent;
