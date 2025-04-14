import { IExtension } from "@/components/Editor";
import { useEffect, useState } from "react";

const useDynamicExtensions = () => {
  const [extensions, setExtensions] = useState<IExtension[]>([]);

  useEffect(() => {
    import("@/editor-extensions").then(
      ({
        contentLinkExtension,
        fileAttachmentExtension,
        questionCardExtension,
        projectCardListExtension,
        documentCardListExtension,
        dailySummaryExtension,
      }) => {
        setExtensions([
          contentLinkExtension,
          fileAttachmentExtension,
          questionCardExtension,
          projectCardListExtension,
          documentCardListExtension,
          dailySummaryExtension,
        ]);
      },
    );
  }, []);

  return extensions;
};

export default useDynamicExtensions;
