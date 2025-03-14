import For from "@/components/For";

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
  onClick: (event: React.MouseEvent, label: string | undefined) => void;
  open: boolean;
}

const HighlightSelect = (props: IHighlightSelectProps) => {
  const { onClick, open } = props;

  if (!open) {
    return null;
  }

  return (
    <div className={styles.highlightSelectContainer}>
      <>
        <div
          className={styles.item}
          onClick={(e) => {
            onClick(e, undefined);
          }}
          style={{ backgroundColor: "inherit" }}
        />
        <For
          data={highlightColors}
          renderItem={({ label, bgColor }) => (
            <div
              className={styles.item}
              onClick={(e) => {
                onClick(e, label);
              }}
              style={{ backgroundColor: bgColor }}
              key={label}
            />
          )}
        />
      </>
    </div>
  );
};

export default HighlightSelect;
