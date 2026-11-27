import { usePluginI18n } from "../i18n";
import { resolvePluginMetadata, type CenterCatalogEntry } from "@tau/plugins/center";
import { categoryLabel } from "./centerDisplay";
import { PluginIcon } from "./PluginIcon";
import { reasonLabel } from "./pluginStatus";
import { StoreActionButton, type StoreTaskPhase } from "./StoreActionButton";
import type { StorePrimaryAction } from "./storeActions";

/** 商店列表行：图标 + 名称 + 一行描述 + 作者/分类，右侧为状态机按钮；整行（按钮除外）进详情。 */
export function StoreEntryRow({
  entry,
  primary,
  phase,
  divider,
  onOpen,
  onPrimary,
  onCancel,
  onRetry,
}: {
  entry: CenterCatalogEntry;
  primary: StorePrimaryAction;
  phase: StoreTaskPhase;
  /** 非首行显示与文字对齐的分隔线 */
  divider: boolean;
  onOpen: () => void;
  onPrimary: () => void;
  onCancel: () => void;
  onRetry: () => void;
}) {
  const { locale } = usePluginI18n();
  const display = resolvePluginMetadata(entry, locale);
  const blocker = primary.kind === "unavailable" ? entry.compatibility.reasons[0] : undefined;
  const category = entry.categories[0];
  return (
    <li
      className="relative flex items-center gap-3 py-3 pr-3.5 pl-3.5"
      data-plugin-id={entry.pluginId}
    >
      {divider && (
        <span aria-hidden className="bg-line-2 absolute top-0 right-0 left-[70px] h-px" />
      )}
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 items-center gap-3 text-left active:opacity-70"
      >
        <PluginIcon id={entry.pluginId} name={display.name} />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-ink-1 truncate text-[15px] font-semibold">{display.name}</span>
          <span className="text-ink-2 truncate text-[12.5px]">{display.description}</span>
          <span className="text-ink-3 mt-0.5 truncate text-[11px]">
            {blocker ? (
              <span className="text-warn">{reasonLabel(blocker)}</span>
            ) : (
              <>
                @{entry.publisher.login}
                {category && ` · ${categoryLabel(category)}`}
              </>
            )}
          </span>
        </span>
      </button>
      <StoreActionButton
        primary={primary}
        phase={phase}
        onPress={onPrimary}
        onCancel={onCancel}
        onRetry={onRetry}
      />
    </li>
  );
}
