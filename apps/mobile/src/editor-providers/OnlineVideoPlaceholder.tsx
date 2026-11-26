import type { VideoContentProvider } from "@tau/editor/extensions/media/services";
import { useMobileVideoI18n } from "./video.i18n";
const OnlineVideoPlaceholder: VideoContentProvider["Content"] = () => {
  const { t } = useMobileVideoI18n();
  return (
    <div className="border-line-1 bg-page/80 text-ink-2 rounded-xl border border-dashed p-3 text-xs">
      {t("desktopOnly")}
    </div>
  );
};

export default OnlineVideoPlaceholder;
