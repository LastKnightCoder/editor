import { CheckMark } from "./ui";

type ThemeSectionProps = {
  isDark: boolean;
  setIsDark: (next: boolean) => void;
};

export function ThemeSection(props: ThemeSectionProps) {
  return (
    <div className="list-group">
      <button
        type="button"
        onClick={() => props.setIsDark(false)}
        className="list-item w-full"
      >
        <span className="text-[15px] text-gray-800 dark:text-gray-100">
          浅色
        </span>
        {!props.isDark && <CheckMark />}
      </button>
      <button
        type="button"
        onClick={() => props.setIsDark(true)}
        className="list-item w-full"
      >
        <span className="text-[15px] text-gray-800 dark:text-gray-100">
          深色
        </span>
        {props.isDark && <CheckMark />}
      </button>
    </div>
  );
}
