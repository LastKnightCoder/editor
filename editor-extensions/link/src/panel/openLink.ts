import { IOpenerService } from "@tau/shared/host-services";
import { useOptionalService } from "@tau/editor/api";

/** 打开链接：宿主提供 IOpenerService 时交给宿主，否则用新窗口。 */
export const useOpenLink = () => {
  const opener = useOptionalService(IOpenerService);
  return (url: string) => {
    if (!url) return;
    if (opener) {
      void opener.open(url);
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  };
};
