import { memo } from "react";
import For from "@/components/For";
import HighlightSelectItem from "./HighlightSelectItem";
import styles from "./index.module.less";

const highlightColors = [
  {
    label: "yellow",
    bgColor: "rgba(255, 212, 0, 0.14)",
  },
  {
    label: "green",
    bgColor: "rgba(42, 157, 143,.14)",
  },
  {
    label: "blue",
    bgColor: "rgba(162, 210, 255,.14)",
  },
  {
    label: "purple",
    bgColor: "rgba(94, 84, 142,.14)",
  },
  {
    label: "red",
    bgColor: "rgba(239, 35, 60, 0.14)",
  },
];

interface IHighlightSelectProps {
  onClick: (label: string | undefined) => void;
}

const HighlightSelect = memo((props: IHighlightSelectProps) => {
  const { onClick } = props;

  return (
    <div className={styles.highlightSelectContainer}>
      <HighlightSelectItem
        label={undefined}
        bgColor={"inherit"}
        onClick={onClick}
      />
      <For
        data={highlightColors}
        renderItem={({ label, bgColor }) => (
          <HighlightSelectItem
            label={label}
            bgColor={bgColor}
            onClick={onClick}
          />
        )}
      />
    </div>
  );
});

export default HighlightSelect;
