import { useState } from "react";
import { formatPluginLocales } from "@tau/plugins/center";
import { cn } from "@tau/ui";
import { Markdown } from "./markdown/Markdown";

/** 仅在包内包含多语言 README 时提供语言切换；老插件直接展示默认说明。 */
export function ReadmeViewer({
  readme,
  readmes,
}: {
  readme: string;
  readmes?: Readonly<Record<string, string>>;
}) {
  const locales = readmes ? Object.keys(readmes) : [];
  const [selected, setSelected] = useState<string | null>(null);
  const active = selected && readmes && Object.hasOwn(readmes, selected) ? selected : null;
  const source = active && readmes ? readmes[active] : readme;
  return (
    <div className="flex flex-col gap-3">
      {locales.length > 0 && (
        <div role="group" aria-label="说明语言" className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            aria-pressed={active === null}
            onClick={() => setSelected(null)}
            className={cn(
              "text-tau-sm rounded-full px-2.5 py-1 transition-colors",
              active === null
                ? "bg-accent-soft text-accent-text font-medium"
                : "text-ink-2 hover:bg-hover"
            )}
          >
            默认
          </button>
          {locales.map(locale => {
            const label = formatPluginLocales([locale], "zh-CN")[0] ?? locale;
            return (
              <button
                key={locale}
                type="button"
                aria-pressed={active === locale}
                onClick={() => setSelected(locale)}
                className={cn(
                  "text-tau-sm rounded-full px-2.5 py-1 transition-colors",
                  active === locale
                    ? "bg-accent-soft text-accent-text font-medium"
                    : "text-ink-2 hover:bg-hover"
                )}
              >
                {label}
              </button>
            );
          })}
        </div>
      )}
      <Markdown source={source} />
    </div>
  );
}
