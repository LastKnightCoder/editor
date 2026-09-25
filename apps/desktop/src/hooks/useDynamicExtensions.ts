import { IExtension } from "@tau/editor/src";
import { useEffect, useState } from "react";

/** 组装编辑器动态扩展；projectItemId 由调用方传入（项目文档编辑器传条目 id，
 *  其余场景缺省——卡片列表扩展在无条目上下文时保持降级行为） */
const useDynamicExtensions = (projectItemId?: number) => {
  const [extensions, setExtensions] = useState<IExtension[]>([]);

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
