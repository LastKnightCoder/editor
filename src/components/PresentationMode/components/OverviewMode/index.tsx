import { Descendant } from "slate";
import Editor from "@/components/Editor";
import styles from "./index.module.less";

// 全览模式组件
const OverviewMode = ({
  slides,
  selectedSlide,
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
  return (
    <div
      className={`${styles.overviewContainer} ${isExiting ? styles.overviewExiting : ""}`}
    >
      {slides.map((slide, index) => (
        <div
          key={index}
          className={`${styles.overviewSlide} ${index === selectedSlide ? styles.active : ""}`}
          onClick={() => onEnterSlide(index)}
        >
          <div className={styles.overviewSlideContent}>
            <Editor
              readonly={true}
              initValue={slide}
              extensions={extensions}
              className={styles.overviewEditor}
              style={{
                // 确保编辑器内容在容器内可见
                width: "100%",
                height: "100%",
                // 添加自定义CSS变量来减小段落间距
                ["--block-distance" as string]: "4px",
              }}
            />
          </div>
          <div className={styles.overviewSlideNumber}>{index + 1}</div>
        </div>
      ))}
    </div>
  );
};

export default OverviewMode;
