import React, {
  useRef,
  useEffect,
  forwardRef,
  useImperativeHandle,
} from "react";
import * as echarts from "echarts";

interface ReactEChartsProps {
  option: echarts.EChartsOption;
  style?: React.CSSProperties;
  theme?: "light" | "dark";
}

export interface ReactEChartsRef {
  getInstance: () => echarts.ECharts | null;
}

const ReactECharts = forwardRef<ReactEChartsRef, ReactEChartsProps>(
  ({ option, style, theme }, ref) => {
    const chartRef = useRef<HTMLDivElement>(null);
    const instanceRef = useRef<echarts.ECharts | null>(null);

    useImperativeHandle(ref, () => ({
      getInstance: () => instanceRef.current,
    }));

    useEffect(() => {
      if (!chartRef.current) return;

      instanceRef.current = echarts.init(chartRef.current, theme);
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
      if (instanceRef.current) {
        instanceRef.current.dispose();
        instanceRef.current = echarts.init(chartRef.current!, theme);
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
