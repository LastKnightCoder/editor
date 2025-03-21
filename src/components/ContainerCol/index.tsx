import React, { useEffect, useRef, useState } from "react";
import { Col, ColProps } from "antd";
import { useMemoizedFn } from "ahooks";

// 断点宽度定义，与 Antd 的断点保持一致
const BREAKPOINTS = {
  xs: 480,
  sm: 576,
  md: 768,
  lg: 992,
  xl: 1200,
  xxl: 1600,
};

type BreakpointKey = keyof typeof BREAKPOINTS;

const ContainerCol: React.FC<ColProps> = (props) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState<number>(0);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);

  // 计算当前容器宽度对应的断点类型
  const getBreakpointFromWidth = useMemoizedFn((width: number) => {
    const breakpoints: Record<BreakpointKey, boolean> = {
      xs: width >= 0 && width < BREAKPOINTS.sm,
      sm: width >= BREAKPOINTS.sm && width < BREAKPOINTS.md,
      md: width >= BREAKPOINTS.md && width < BREAKPOINTS.lg,
      lg: width >= BREAKPOINTS.lg && width < BREAKPOINTS.xl,
      xl: width >= BREAKPOINTS.xl && width < BREAKPOINTS.xxl,
      xxl: width >= BREAKPOINTS.xxl,
    };
    return breakpoints;
  });

  // 获取断点属性的 span 值
  const getBreakpointSpan = (value: ColProps["xl"]): number | undefined => {
    if (typeof value === "number") return value;
    if (value && typeof value === "object" && "span" in value) {
      return value.span && typeof value.span === "number"
        ? value.span
        : undefined;
    }
    return undefined;
  };

  // 根据当前断点和 props 计算实际的 span 值
  const calculateSpan = useMemoizedFn(() => {
    if (!containerWidth) return props.span || 24;

    const breakpoints = getBreakpointFromWidth(containerWidth);

    // 按照优先级从小到大，逐个检查是否有对应的断点属性
    if (breakpoints.xxl && props.xxl) {
      return getBreakpointSpan(props.xxl) || props.span || 24;
    }
    if (breakpoints.xl && props.xl) {
      return getBreakpointSpan(props.xl) || props.span || 24;
    }
    if (breakpoints.lg && props.lg) {
      return getBreakpointSpan(props.lg) || props.span || 24;
    }
    if (breakpoints.md && props.md) {
      return getBreakpointSpan(props.md) || props.span || 24;
    }
    if (breakpoints.sm && props.sm) {
      return getBreakpointSpan(props.sm) || props.span || 24;
    }
    if (breakpoints.xs && props.xs) {
      return getBreakpointSpan(props.xs) || props.span || 24;
    }

    // 如果没有匹配的断点属性，则使用默认的 span
    return props.span || 24;
  });

  // 计算实际要传递给 Col 的属性
  const calculateProps = useMemoizedFn(() => {
    // 复制原始属性，但排除所有断点相关的属性，因为我们将自行计算 span 值
    const { xs, sm, md, lg, xl, xxl, ...restProps } = props;

    // 使用计算出的 span 值
    return {
      ...restProps,
      span: calculateSpan(),
    };
  });

  useEffect(() => {
    // 初始化 ResizeObserver 来监听容器大小变化
    const resizeCallback = (entries: ResizeObserverEntry[]) => {
      const entry = entries[0];
      if (entry) {
        // 获取父容器宽度
        const parentWidth = entry.contentRect.width;
        setContainerWidth(parentWidth);
      }
    };

    const observer = new ResizeObserver(resizeCallback);
    resizeObserverRef.current = observer;

    // 观察父容器
    const parentContainer = containerRef.current?.parentElement;
    if (parentContainer) {
      observer.observe(parentContainer);
    }

    return () => {
      observer.disconnect();
    };
  }, []);

  // 计算最终要传递给 Col 的属性
  const colProps = calculateProps();

  return (
    <Col ref={containerRef} {...colProps}>
      {props.children}
    </Col>
  );
};

export default ContainerCol;
