import { IExtension } from "@/components/Editor";
import { useEffect, useState } from "react";
import { useProjectContext } from "@/pages/ProjectView/ProjectContext";
import { useDocumentContext } from "@/pages/DocumentView/DocumentContext";

const useDynamicExtensions = () => {
  const [extensions, setExtensions] = useState<IExtension[]>([]);

  const { itemId: projectItemId } = useProjectContext();
  const { itemId: documentItemId } = useDocumentContext();

  useEffect(() => {
    import("@/editor-extensions").then(
      ({
        contentLinkExtension,
        fileAttachmentExtension,
        questionCardExtension,
        createProjectCardListExtension,
        createDocumentCardListExtension,
        chatReferenceExtension,
      }) => {
        setExtensions([
          contentLinkExtension,
          fileAttachmentExtension,
          questionCardExtension,
          createProjectCardListExtension(projectItemId),
          createDocumentCardListExtension(documentItemId),
          chatReferenceExtension,
        ]);
      },
    );
  }, [projectItemId, documentItemId]);

  return extensions;
};

export default useDynamicExtensions;
