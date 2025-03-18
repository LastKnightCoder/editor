import { Descendant } from "slate";
import Editor from "@/components/Editor";
import styles from "./index.module.less";
import { useEffect, useState, useCallback } from "react";
import useGridLayout from "@/hooks/useGridLayout";

// 全览模式组件
const OverviewMode = ({
  slides,
  selectedSlide,
  onSelectSlide,
  onEnterSlide,
  extensions,
  isExiting = false,
}: {
  slides: Descendant[][];
  selectedSlide: number;
  onSelectSlide: (index: number) => void;
  onEnterSlide: (index: number) => void;
  extensions: any[];
  isExiting?: boolean;
}) => {
  // 使用GridLayout Hook进行布局计算
  const { gridContainerRef, itemWidth, gap } = useGridLayout({
    minWidth: 280,
    maxWidth: 380,
    gap: 20,
  });

  // 记录当前布局的列数
  const [columnsCount, setColumnsCount] = useState(0);

  // 计算列数
  useEffect(() => {
    if (gridContainerRef.current) {
      const containerWidth = gridContainerRef.current.offsetWidth;
      const calculatedColumns = Math.floor(
        (containerWidth + gap) / (itemWidth + gap),
      );
      setColumnsCount(calculatedColumns);
    }
  }, [itemWidth, gap, gridContainerRef.current?.offsetWidth]);

  // 使用键盘导航
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!columnsCount) return;

      let newIndex = selectedSlide;

      switch (e.key) {
        case "ArrowUp":
          // 向上导航（移动一行）
          if (selectedSlide - columnsCount >= 0) {
            newIndex = selectedSlide - columnsCount;
          }
          break;
        case "ArrowDown":
          // 向下导航（移动一行）
          if (selectedSlide + columnsCount < slides.length) {
            newIndex = selectedSlide + columnsCount;
          }
          break;
        case "ArrowLeft":
          // 向左导航
          if (selectedSlide > 0) {
            newIndex = selectedSlide - 1;
          }
          break;
        case "ArrowRight":
          // 向右导航
          if (selectedSlide < slides.length - 1) {
            newIndex = selectedSlide + 1;
          }
          break;
        case "Enter":
          // 进入选中的幻灯片
          onEnterSlide(selectedSlide);
          return;
        default:
          return;
      }

      if (newIndex !== selectedSlide) {
        e.preventDefault();
        onSelectSlide(newIndex);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [selectedSlide, slides.length, columnsCount, onSelectSlide, onEnterSlide]);

  return (
    <div
      ref={gridContainerRef}
      className={`${styles.overviewContainer} ${isExiting ? styles.overviewExiting : ""}`}
      style={{ gap: `${gap}px` }}
    >
      {slides.map((slide, index) => (
        <div
          key={index}
          className={`${styles.overviewSlide} ${index === selectedSlide ? styles.active : ""}`}
          onClick={() => onEnterSlide(index)}
          style={{ width: `${itemWidth}px` }}
        >
          <div className={styles.overviewSlideContent}>
            <Editor
              readonly={true}
              initValue={slide}
              extensions={extensions}
              className={styles.overviewEditor}
            />
          </div>
          <div className={styles.overviewSlideNumber}>{index + 1}</div>
        </div>
      ))}
    </div>
  );
};

export default OverviewMode;
