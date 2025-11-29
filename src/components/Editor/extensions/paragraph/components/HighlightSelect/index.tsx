import { memo } from "react";
import For from "@/components/For";
import HighlightSelectItem from "./HighlightSelectItem";
import useThemeColors from "@/hooks/useThemeColors";
import classnames from "classnames";

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
  const themeColors = useThemeColors();

  return (
    <div
      className={classnames(
        "flex items-center gap-2 p-2 rounded-xl shadow-xl border backdrop-blur-xl backdrop-saturate-150",
        themeColors.glassPanelBg,
        themeColors.borderClass,
      )}
    >
      <HighlightSelectItem
        label={undefined}
        bgColor={"inherit"}
        onClick={onClick}
      />
      <div className="w-px h-4 bg-gray-200 dark:bg-gray-700 mx-1" />
      <div className="flex items-center gap-2">
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
