import { memo, useEffect, useRef } from "react";
import styles from "./index.module.less";

interface IHighlightSelectItemProps {
  label?: string;
  bgColor: string;
  onClick: (label: string | undefined) => void;
}

const HighlightSelectItem = memo((props: IHighlightSelectItemProps) => {
  const { label, bgColor, onClick } = props;

  const itemRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!itemRef.current) return;

    const handleClick = (e: MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      onClick(label);
    };

    itemRef.current.addEventListener("click", handleClick);

    return () => {
      itemRef.current?.removeEventListener("click", handleClick);
    };
  }, [label, onClick]);

  return (
    <div
      ref={itemRef}
      className={styles.item}
      style={{ backgroundColor: bgColor }}
      key={label}
    />
  );
});

export default HighlightSelectItem;
