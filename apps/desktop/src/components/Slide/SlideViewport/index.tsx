import { useEffect, useRef, useState } from "react";
import classNames from "classnames";
import useSettingStore from "@/stores/useSettingStore";

interface SlideViewportProps {
  width: number;
  height: number;
  baseFontScale: number;
  /** 背景配置：可以是颜色字符串，或者图片URL */
  background?: string;
  /** 背景图片URL（优先级高于background） */
  backgroundImage?: string;
  children: React.ReactNode;
  className?: string;
  /** 是否显示画布阴影 */
  showShadow?: boolean;
  /** 是否显示圆角 */
  showRounded?: boolean;
}

const SlideViewport = ({
  width,
  height,
  baseFontScale,
  background,
  backgroundImage,
  children,
  className,
  showShadow = true,
  showRounded = true,
}: SlideViewportProps) => {
  const isDark = useSettingStore((state) => state.setting.darkMode);
  // 如果没有提供 background，则根据主题自动选择
  // 深色模式：深灰画布；浅色模式：白色画布
  const effectiveBackground = background ?? (isDark ? "#1a1f2e" : "#ffffff");
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateScale = () => {
      if (!container) return;
      const containerWidth = container.clientWidth;
      const containerHeight = container.clientHeight;

      // 计算等比缩放比例
      const wScale = containerWidth / width;
      const hScale = containerHeight / height;
      const newScale = Math.min(wScale, hScale);

      setScale(newScale);
    };

    updateScale();
    const observer = new ResizeObserver(updateScale);
    observer.observe(container);

    return () => observer.disconnect();
  }, [width, height]);

  // 基础字体大小计算
  // baseFontScale = 1 时，基础字体为 20px（适合幻灯片展示）
  // baseFontScale = 2 时，基础字体为 40px（大标题）
  const baseFontSize = baseFontScale * 20;

  // 画布阴影样式
  const canvasShadow = showShadow
    ? isDark
      ? "0 4px 24px -4px rgba(0, 0, 0, 0.5)"
      : "0 4px 24px -4px rgba(0, 0, 0, 0.1)"
    : undefined;

  return (
    <div
      ref={containerRef}
      className={classNames(
        "relative w-full h-full flex items-center justify-center overflow-hidden",
        className,
      )}
    >
      <div
        className={classNames("relative overflow-hidden", showRounded && "rounded-lg")}
        style={{
          width: width * scale,
          height: height * scale,
          fontSize: baseFontSize * scale,
          background: effectiveBackground,
          backgroundImage: backgroundImage ? `url(${backgroundImage})` : undefined,
          backgroundSize: backgroundImage ? "cover" : undefined,
          backgroundPosition: backgroundImage ? "center" : undefined,
          boxShadow: canvasShadow,
        }}
      >
        <div
          style={{
            width,
            height,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
            fontSize: baseFontSize,
            padding: 40,
            boxSizing: "border-box",
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
};

export default SlideViewport;
