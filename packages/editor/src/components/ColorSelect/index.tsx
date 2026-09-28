import classnames from "classnames";
import For from "../For";
import { Check } from "lucide-react";

interface ColorSelectProps<ColorType extends string> {
  colors: Array<{
    label: ColorType;
    color: string;
  }>;
  selectColor: string;
  onSelectColor: (color: ColorType) => void;
}

const ColorSelect = <ColorType extends string>(props: ColorSelectProps<ColorType>) => {
  const { selectColor, onSelectColor, colors } = props;

  return (
    <div
      className={
        "relative z-[10060] flex flex-wrap items-center gap-2 rounded-2xl p-4 " +
        "border border-white/40 bg-white/90 dark:border-white/10 dark:bg-zinc-900/85" +
        "shadow-[0_18px_45px_rgba(15,23,42,0.25)] backdrop-blur-2xl backdrop-saturate-150" +
        "dark:shadow-[0_22px_60px_rgba(2,6,23,0.7)]"
      }
    >
      <For
        data={colors}
        renderItem={({ label, color }) => (
          <div
            key={label}
            className={classnames(
              "flex h-6 w-6 cursor-pointer items-center justify-center rounded-full border border-transparent transition-all duration-150 ease-out hover:scale-110 hover:shadow-[0_10px_25px_rgba(15,23,42,0.2)]",
              label === selectColor && "border-blue-500 shadow-[0_12px_28px_rgba(37,99,235,0.35)]"
            )}
            onClick={e => {
              e.preventDefault();
              e.stopPropagation();
              onSelectColor(label);
            }}
            style={{
              backgroundColor: color,
            }}
          >
            {label === selectColor && <Check className="h-3.5 w-3.5 text-[var(--ed-text)]" />}
          </div>
        )}
      />
    </div>
  );
};

export default ColorSelect;
