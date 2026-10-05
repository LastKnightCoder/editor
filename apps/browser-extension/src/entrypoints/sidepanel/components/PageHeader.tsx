import { useState } from "react";
import { Library, MoreHorizontal, RefreshCw, Settings } from "lucide-react";
import { getTheme } from "@tau/themes";
import { IconButton, Menu } from "@tau/ui";
import type { ActiveTabInfo } from "../../../hooks/useActiveTab";
import { useExtensionThemeStore } from "../../../stores/useExtensionTheme";

const hostOf = (url: string | null) => {
  if (!url) return "";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};

/** 站点图标；没有或加载失败时用域名首字母 */
function SiteIcon({ tab }: { tab: ActiveTabInfo }) {
  const [failed, setFailed] = useState<string | null>(null);
  const host = hostOf(tab.url);
  const showImage = tab.favIconUrl && failed !== tab.favIconUrl;
  return (
    <span className="border-line-1 bg-surface text-accent-text grid size-7 shrink-0 place-items-center overflow-hidden rounded-[8px] border text-[12px] font-bold uppercase">
      {showImage ? (
        <img
          src={tab.favIconUrl!}
          alt=""
          className="size-4"
          onError={() => setFailed(tab.favIconUrl)}
        />
      ) : (
        host.charAt(0) || "τ"
      )}
    </span>
  );
}

/** 本页流顶栏：当前网页（图标 + 标题 + 域名）；全部笔记、设置、重新连接收在 ⋯ */
export function PageHeader({
  tab,
  connecting,
  onAllNotes,
  onSettings,
  onReconnect,
}: {
  tab: ActiveTabInfo;
  connecting: boolean;
  onAllNotes: () => void;
  onSettings: () => void;
  onReconnect: () => void;
}) {
  const themeKey = useExtensionThemeStore(state => state.theme);
  const themeName = getTheme(themeKey)?.name ?? themeKey;
  const host = hostOf(tab.url);

  return (
    <header className="flex shrink-0 items-center gap-2.5 py-2.5 pl-3.5 pr-2.5">
      <SiteIcon tab={tab} />
      <div className="min-w-0 flex-1">
        <div className="text-tau-body-lg text-ink-1 truncate font-semibold" title={tab.title ?? ""}>
          {tab.title || host || "当前网页"}
        </div>
        {host && <div className="text-tau-micro text-ink-3 truncate">{host}</div>}
      </div>
      <Menu
        align="end"
        className="w-[220px]"
        trigger={
          <IconButton aria-label="更多" title="更多" className="size-8">
            <MoreHorizontal size={16} strokeWidth={1.75} />
          </IconButton>
        }
      >
        <Menu.Item icon={<Library />} onSelect={onAllNotes}>
          全部笔记
        </Menu.Item>
        <Menu.Separator />
        <Menu.Item icon={<Settings />} onSelect={onSettings}>
          设置
        </Menu.Item>
        <Menu.Item icon={<RefreshCw />} onSelect={onReconnect}>
          重新连接
        </Menu.Item>
        <Menu.Separator />
        <div className="text-tau-sm text-ink-3 flex h-7 items-center gap-2 px-2.5">
          <span
            className={connecting ? "bg-warn size-2 rounded-full" : "bg-ok size-2 rounded-full"}
          />
          {connecting ? "正在重新连接…" : `已连接桌面端 · 主题 ${themeName}`}
        </div>
      </Menu>
    </header>
  );
}
