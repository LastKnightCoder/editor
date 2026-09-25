import { IExtension } from "@tau/editor/src";
import { useEffect, useState } from "react";
import { useProjectContext } from "@/features/projects/components/ProjectView/ProjectContext";

const useDynamicExtensions = () => {
  const [extensions, setExtensions] = useState<IExtension[]>([]);

  const { itemId: projectItemId } = useProjectContext();

  useEffect(() => {
    import("@/editor-extensions").then(
      ({ contentLinkExtension, fileAttachmentExtension, createProjectCardListExtension }) => {
        setExtensions([
          contentLinkExtension,
          fileAttachmentExtension,
          createProjectCardListExtension(projectItemId),
        ]);
      }
    );
  }, [projectItemId]);

  return extensions;
};

export default useDynamicExtensions;
