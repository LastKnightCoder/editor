import classnames from "classnames";
import For from "@/components/For";
import SVG from "react-inlinesvg";

import checkIcon from "@/assets/icons/check.svg";

interface ColorSelectProps<ColorType extends string> {
  colors: Array<{
    label: ColorType;
    color: string;
  }>;
  selectColor: string;
  onSelectColor: (color: ColorType) => void;
}

const ColorSelect = <ColorType extends string>(
  props: ColorSelectProps<ColorType>,
) => {
  const { selectColor, onSelectColor, colors } = props;

  return (
    <div
      className={
        "flex flex-wrap items-center gap-2 p-4 rounded-2xl relative z-[10060] " +
        "bg-white/90 dark:bg-slate-900/85 border border-white/40 dark:border-white/10 " +
        "backdrop-blur-2xl backdrop-saturate-150 shadow-[0_18px_45px_rgba(15,23,42,0.25)] " +
        "dark:shadow-[0_22px_60px_rgba(2,6,23,0.7)]"
      }
    >
      <For
        data={colors}
        renderItem={({ label, color }) => (
          <div
            key={label}
            className={classnames(
              "w-6 h-6 rounded-full border border-transparent flex items-center justify-center cursor-pointer transition-all duration-150 ease-out hover:scale-110 hover:shadow-[0_10px_25px_rgba(15,23,42,0.2)]",
              label === selectColor &&
                "border-blue-500 shadow-[0_12px_28px_rgba(37,99,235,0.35)]",
            )}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onSelectColor(label);
            }}
            style={{
              backgroundColor: color,
            }}
          >
            {label === selectColor && (
              <SVG
                src={checkIcon}
                className="w-3.5 h-3.5 text-slate-900 dark:text-slate-100"
                style={{ fill: "currentColor" }}
              />
            )}
          </div>
        )}
      />
    </div>
  );
};

export default ColorSelect;
