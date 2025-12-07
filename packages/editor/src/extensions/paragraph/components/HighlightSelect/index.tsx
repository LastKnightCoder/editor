import { memo } from "react";
import { For } from "@tau/shared";
import HighlightSelectItem from "./HighlightSelectItem";

const highlightColors = [
  {
    label: "yellow",
    bgColor: "rgba(255, 212, 0, 0.6)",
  },
  {
    label: "green",
    bgColor: "rgba(42, 157, 143, 0.6)",
  },
  {
    label: "blue",
    bgColor: "rgba(162, 210, 255, 0.8)",
  },
  {
    label: "purple",
    bgColor: "rgba(157, 148, 200, 0.6)",
  },
  {
    label: "red",
    bgColor: "rgba(239, 35, 60, 0.5)",
  },
];

interface IHighlightSelectProps {
  onClick: (label: string | undefined) => void;
}

const HighlightSelect = memo((props: IHighlightSelectProps) => {
  const { onClick } = props;

  return (
    <div
      className={
        "flex items-center gap-3 px-4 py-3 rounded-2xl relative z-[10060] " +
        "bg-white/90 dark:bg-slate-900/85 border border-white/40 dark:border-white/10 " +
        "backdrop-blur-2xl backdrop-saturate-150 shadow-[0_18px_45px_rgba(15,23,42,0.25)] " +
        "dark:shadow-[0_22px_60px_rgba(2,6,23,0.7)]"
      }
    >
      <HighlightSelectItem
        label={undefined}
        bgColor={"inherit"}
        onClick={onClick}
      />
      <div className="h-[22px] w-px bg-slate-200/90 dark:bg-slate-700/60" />
      <div className="flex flex-wrap items-center gap-3">
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
    </div>
  );
});

export default HighlightSelect;
