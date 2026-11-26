import { usePluginControlsI18n } from "../controls.i18n";
import { Activity } from "react";
import { Maximize2, Minimize2, PanelRightClose } from "lucide-react";
import { IconButton } from "@tau/ui";
import type { AssistViewProps } from "@/app/assistViews";
import { useDesktopPlugins } from "@/app/plugins/context";
import { useShellStore } from "@/app/shellStore";
import { useOverlayDismiss } from "@/page/PageProvider";
import { PluginPageSurface } from "../views/PluginPageView";

export function PluginPageDock({ open, onClose }: AssistViewProps) {
  const { t } = usePluginControlsI18n();
  const runtime = useDesktopPlugins();
  const target = useShellStore(s => s.pluginDock);
  const expanded = useShellStore(s => s.assistExpanded);
  const setExpanded = useShellStore(s => s.setAssistExpanded);
  useOverlayDismiss(() => setExpanded(false), open && expanded);
  const page = target && runtime?.getPage(target.pluginId, target.pageId);
  if (!target || !page || page.mountId !== target.mountId) return null;
  const expandLabel = expanded ? t("dock.collapse") : t("dock.expand");
  return (
    <Activity mode={open ? "visible" : "hidden"}>
      <div className="flex h-12 flex-none items-center gap-1 px-3">
        <span className="text-ink-1 min-w-0 flex-1 truncate font-medium">{target.title}</span>
        <IconButton
          title={expandLabel}
          aria-label={expandLabel}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
        </IconButton>
        <IconButton title={t("dock.close")} aria-label={t("dock.close")} onClick={onClose}>
          <PanelRightClose size={16} />
        </IconButton>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <PluginPageSurface
          key={JSON.stringify([target.mountId, target.instanceId])}
          placement="dock"
          page={page}
          route={target}
          dockParams={target.params}
        />
      </div>
    </Activity>
  );
}
