import { Descendant } from "slate";
import Editor from "@/components/Editor";
import styles from "./index.module.less";
import { useEffect, useRef, useState } from "react";
import classnames from "classnames";

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
  const gridContainerRef = useRef<HTMLDivElement>(null);
  const [columnsCount, setColumnsCount] = useState(0);

  // 计算列数用于键盘导航
  useEffect(() => {
    const calculateColumns = () => {
      if (!gridContainerRef.current) return;

      const containerWidth = gridContainerRef.current.offsetWidth;
      const minItemWidth = 200; // 对应CSS grid的minmax(200px, 1fr)
      const gap = 20;

      // 计算方法与CSS grid的repeat(auto-fill, minmax(200px, 1fr))保持一致
      const columns = Math.floor((containerWidth + gap) / (minItemWidth + gap));
      setColumnsCount(Math.max(1, columns));
    };

    calculateColumns();
    window.addEventListener("resize", calculateColumns);

    return () => window.removeEventListener("resize", calculateColumns);
  }, []);

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
      className={classnames(styles.overviewContainer, {
        [styles.overviewExiting]: isExiting,
      })}
    >
      {slides.map((slide, index) => (
        <div
          key={index}
          className={classnames(styles.overviewSlide, {
            [styles.active]: index === selectedSlide,
          })}
          onClick={() => onEnterSlide(index)}
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
