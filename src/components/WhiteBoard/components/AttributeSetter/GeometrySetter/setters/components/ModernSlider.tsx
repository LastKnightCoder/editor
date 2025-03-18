import React, { useState, useCallback, useEffect, useRef, memo } from "react";
import styles from "../setters.module.less";

interface ModernSliderProps {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
}

export const ModernSlider = memo<ModernSliderProps>(
  ({ value, min, max, step = 1, onChange }) => {
    const [isDragging, setIsDragging] = useState(false);
    const sliderRef = useRef<HTMLDivElement>(null);

    // 计算百分比位置
    const percentage = ((value - min) / (max - min)) * 100;

    // 根据鼠标位置计算值
    const calculateValue = useCallback(
      (clientX: number, rect: DOMRect) => {
        const percentage = Math.max(
          0,
          Math.min(100, ((clientX - rect.left) / rect.width) * 100),
        );
        const newValue = min + ((max - min) * percentage) / 100;

        // 按照step取整
        const steppedValue =
          step > 0 ? Math.round(newValue / step) * step : newValue;

        // 限制在min和max范围内
        return Math.min(max, Math.max(min, steppedValue));
      },
      [min, max, step],
    );

    const handleMouseDown = useCallback(
      (e: React.MouseEvent<HTMLDivElement>) => {
        if (!sliderRef.current) return;

        // 防止事件冒泡和默认行为
        e.preventDefault();
        e.stopPropagation();

        setIsDragging(true);

        const rect = sliderRef.current.getBoundingClientRect();
        const newValue = calculateValue(e.clientX, rect);

        // 只有在值变化时才触发onChange
        if (newValue !== value) {
          onChange(newValue);
        }
      },
      [value, onChange, calculateValue],
    );

    const handleTouchStart = useCallback(
      (e: React.TouchEvent<HTMLDivElement>) => {
        if (!sliderRef.current) return;

        // 防止事件冒泡和默认行为
        e.preventDefault();
        e.stopPropagation();

        setIsDragging(true);

        const rect = sliderRef.current.getBoundingClientRect();
        const touch = e.touches[0];
        const newValue = calculateValue(touch.clientX, rect);

        // 只有在值变化时才触发onChange
        if (newValue !== value) {
          onChange(newValue);
        }
      },
      [value, onChange, calculateValue],
    );

    const handleMouseMove = useCallback(
      (e: MouseEvent) => {
        if (!isDragging || !sliderRef.current) return;

        e.preventDefault();

        const rect = sliderRef.current.getBoundingClientRect();
        const newValue = calculateValue(e.clientX, rect);

        // 只有在值变化时才触发onChange
        if (newValue !== value) {
          onChange(newValue);
        }
      },
      [isDragging, value, onChange, calculateValue],
    );

    const handleTouchMove = useCallback(
      (e: TouchEvent) => {
        if (!isDragging || !sliderRef.current) return;

        e.preventDefault();

        const rect = sliderRef.current.getBoundingClientRect();
        const touch = e.touches[0];
        const newValue = calculateValue(touch.clientX, rect);

        // 只有在值变化时才触发onChange
        if (newValue !== value) {
          onChange(newValue);
        }
      },
      [isDragging, value, onChange, calculateValue],
    );

    const handleEnd = useCallback(() => {
      setIsDragging(false);
    }, []);

    // 添加和移除全局事件监听
    useEffect(() => {
      if (isDragging) {
        document.addEventListener("mousemove", handleMouseMove, {
          passive: false,
        });
        document.addEventListener("touchmove", handleTouchMove, {
          passive: false,
        });
        document.addEventListener("mouseup", handleEnd);
        document.addEventListener("touchend", handleEnd);
        document.addEventListener("touchcancel", handleEnd);
      }

      return () => {
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("touchmove", handleTouchMove);
        document.removeEventListener("mouseup", handleEnd);
        document.removeEventListener("touchend", handleEnd);
        document.removeEventListener("touchcancel", handleEnd);
      };
    }, [isDragging, handleMouseMove, handleTouchMove, handleEnd]);

    return (
      <div
        ref={sliderRef}
        className={`${styles.modernSlider} ${isDragging ? styles.dragging : ""}`}
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
      >
        <div className={styles.sliderTrack}>
          <div
            className={styles.sliderFill}
            style={{ width: `${percentage}%` }}
          />
        </div>
        <div
          className={styles.sliderHandle}
          style={{ left: `${percentage}%` }}
        />
      </div>
    );
  },
);

ModernSlider.displayName = "ModernSlider";

export default ModernSlider;
