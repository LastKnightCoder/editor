import { IExtension } from "@tau/editor/src";
import { useEffect, useState } from "react";
import { useProjectContext } from "@/features/projects/components/ProjectView/ProjectContext";

const useDynamicExtensions = () => {
  const [extensions, setExtensions] = useState<IExtension[]>([]);

  const { itemId: projectItemId } = useProjectContext();

  useEffect(() => {
    import("@/editor-extensions").then(
      ({
        contentLinkExtension,
        fileAttachmentExtension,
        questionCardExtension,
        createProjectCardListExtension,
        chatReferenceExtension,
      }) => {
        setExtensions([
          contentLinkExtension,
          fileAttachmentExtension,
          questionCardExtension,
          createProjectCardListExtension(projectItemId),
          chatReferenceExtension,
        ]);
      }
    );
  }, [projectItemId]);

  return extensions;
};

export default useDynamicExtensions;
