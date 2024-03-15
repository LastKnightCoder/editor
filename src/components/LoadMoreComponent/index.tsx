import React, { useRef } from "react";
import useLoadMore from "@/hooks/useLoadMore";
import If from "@/components/If";

interface ILoadMoreComponentProps {
  className?: string;
  style?: React.CSSProperties;
  onLoadMore: () => Promise<void>;
  children?: React.ReactNode;
  showLoader?: boolean;
}

const LoadMoreComponent = (props: ILoadMoreComponentProps) => {
  const { className, style, onLoadMore, children, showLoader = true } = props;
  const loaderRef = useRef<HTMLDivElement>(null);

  useLoadMore(loaderRef, onLoadMore);

  return (
    <div className={className} style={style}>
      {children}
      <If condition={showLoader}>
        <div ref={loaderRef} style={{ textAlign: 'center', padding: 10 }}>
          加载中...
        </div>
      </If>
    </div>
  )
}

export default LoadMoreComponent;
