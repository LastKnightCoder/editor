import { CheckMark } from "./ui";

type ThemeSectionProps = {
  isDark: boolean;
  setIsDark: (next: boolean) => void;
};

export function ThemeSection(props: ThemeSectionProps) {
  return (
    <div className="space-y-4">
      <div className="list-group p-4">
        <h2 className="mb-3 text-[15px] font-medium text-gray-800 dark:text-gray-100">主题模式</h2>
        <div className="overflow-hidden rounded-lg border border-gray-100 dark:border-neutral-800">
          <button type="button" onClick={() => props.setIsDark(false)} className="list-item w-full">
            <span className="text-[15px] text-gray-800 dark:text-gray-100">浅色</span>
            {!props.isDark && <CheckMark />}
          </button>
          <button
            type="button"
            onClick={() => props.setIsDark(true)}
            className="list-item w-full border-t border-gray-100 dark:border-neutral-800"
          >
            <span className="text-[15px] text-gray-800 dark:text-gray-100">深色</span>
            {props.isDark && <CheckMark />}
          </button>
        </div>
      </div>
    </div>
  );
}
