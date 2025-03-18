import { useEffect, useRef, memo } from "react";
import rough from "roughjs";
import styles from "../setters.module.less";
import { useMemoizedFn } from "ahooks";

// 使用memo防止不必要的重新渲染
const StyleOption = memo<{
  style: string;
  label: string;
  selected: boolean;
  onClick: (value: string) => void;
}>(({ style, label, selected, onClick }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // 只有在组件挂载时或style变化时才重新渲染canvas
  useEffect(() => {
    if (!canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");

    // 先清除画布
    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }

    const rc = rough.canvas(canvas);
    rc.rectangle(4, 4, 52, 32, {
      fillStyle: style as any,
      fill: "#86a8e7",
      stroke: "#2c3e50",
      strokeWidth: 1,
      roughness: 1,
    });
  }, [style]);

  const onClickStyle = useMemoizedFn(() => {
    onClick(style);
  });

  return (
    <div
      className={`${styles.styleOption} ${selected ? styles.selected : ""}`}
      onClick={onClickStyle}
    >
      <canvas ref={canvasRef} width={60} height={40} />
      <span className={styles.styleLabel}>{label}</span>
    </div>
  );
});

// 添加displayName以便于调试
StyleOption.displayName = "StyleOption";

type StyleOptionType = {
  label: string;
  value: string;
};

// 使用memo包装整个组件
export const StyleOptionGrid = memo<{
  options: ReadonlyArray<StyleOptionType>;
  selectedValue: string;
  onSelect: (value: string) => void;
}>(({ options, selectedValue, onSelect }) => {
  const onClick = useMemoizedFn((value: string) => {
    onSelect(value);
  });

  return (
    <div className={styles.styleGrid}>
      {options.map((option) => (
        <StyleOption
          key={option.value}
          style={option.value}
          label={option.label}
          selected={selectedValue === option.value}
          onClick={onClick}
        />
      ))}
    </div>
  );
});

StyleOptionGrid.displayName = "StyleOptionGrid";
