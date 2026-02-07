import { useMemo } from "react";
import { Webview } from "@tau/shared";
import { remoteResourceToLocal } from "@/utils";
import { convertFileSrc, getHomeDir } from "@/commands";
import type { VLResource, RemoteSourceMeta } from "@/types/vibe-learning";

interface HtmlPreviewProps {
  resource: VLResource;
}

const HtmlPreview: React.FC<HtmlPreviewProps> = ({ resource }) => {
  const { src, sourceType } = useMemo(() => {
    if (resource.sourceType === "remote" && resource.sourceMetaInfo) {
      try {
        const meta: RemoteSourceMeta = JSON.parse(resource.sourceMetaInfo);
        if (meta.url) {
          return { src: meta.url, sourceType: "url" as const };
        }
      } catch {
        // fall through
      }
    }
    return {
      src: resource.originalPath,
      sourceType: "local" as const,
    };
  }, [resource]);

  return (
    <div className="flex-1 h-full overflow-hidden">
      <Webview
        src={src}
        sourceType={sourceType}
        remoteResourceToLocal={remoteResourceToLocal}
        convertFileSrc={convertFileSrc}
        getHomeDir={getHomeDir}
        className="w-full h-full"
      />
    </div>
  );
};

export default HtmlPreview;
