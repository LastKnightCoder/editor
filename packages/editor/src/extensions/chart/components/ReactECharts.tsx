import React, {
  useRef,
  useEffect,
  forwardRef,
  useImperativeHandle,
} from "react";

declare global {
  interface Window {
    echarts: any;
  }
}

interface ReactEChartsProps {
  option: any;
  style?: React.CSSProperties;
  theme?: "light" | "dark";
}

export interface ReactEChartsRef {
  getInstance: () => any;
}

const ReactECharts = forwardRef<ReactEChartsRef, ReactEChartsProps>(
  ({ option, style, theme }, ref) => {
    const chartRef = useRef<HTMLDivElement>(null);
    const instanceRef = useRef<any>();

    useImperativeHandle(ref, () => ({
      getInstance: () => instanceRef.current,
    }));

    useEffect(() => {
      if (!chartRef.current || !window.echarts) return;

      instanceRef.current = window.echarts.init(chartRef.current, theme);
      instanceRef.current.setOption(option);

      const resizeObserver = new ResizeObserver(() => {
        instanceRef.current?.resize();
      });
      resizeObserver.observe(chartRef.current);

      return () => {
        resizeObserver.disconnect();
        instanceRef.current?.dispose();
      };
    }, []);

    useEffect(() => {
      instanceRef.current?.setOption(option, { notMerge: true });
    }, [option]);

    useEffect(() => {
      if (instanceRef.current && window.echarts) {
        instanceRef.current.dispose();
        instanceRef.current = window.echarts.init(chartRef.current!, theme);
        instanceRef.current.setOption(option);
      }
    }, [theme]);

    return (
      <div ref={chartRef} style={{ width: "100%", height: "100%", ...style }} />
    );
  },
);

ReactECharts.displayName = "ReactECharts";

export default ReactECharts;
