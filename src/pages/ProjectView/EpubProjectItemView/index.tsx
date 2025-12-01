import { memo, useEffect, useState } from "react";
import { App } from "antd";

import { getEpubById } from "@/commands/epub";
import { getProjectItemById } from "@/commands";
import { EProjectItemType, Epub, ProjectItem } from "@/types";
import EpubReader from "@/pages/PdfView/EpubReader";

interface EpubProjectItemViewProps {
  projectItemId: number;
}

const EpubProjectItemView = memo(
  ({ projectItemId }: EpubProjectItemViewProps) => {
    const { message } = App.useApp();
    const [projectItem, setProjectItem] = useState<ProjectItem | null>(null);
    const [epub, setEpub] = useState<Epub | null>(null);

    useEffect(() => {
      if (!projectItemId) return;

      let mounted = true;

      const load = async () => {
        try {
          const item = await getProjectItemById(projectItemId);
          if (!item || item.projectItemType !== EProjectItemType.Epub) return;
          if (!mounted) return;
          setProjectItem(item);

          if (!item.refId) return;
          const epubData = await getEpubById(item.refId);
          if (!mounted) return;
          setEpub(epubData);
        } catch (error) {
          console.error("加载 EPUB 项失败:", error);
          message.error("加载 EPUB 内容失败");
        }
      };

      load();

      return () => {
        mounted = false;
        setProjectItem(null);
        setEpub(null);
      };
    }, [projectItemId, message]);

    if (!projectItem || !epub) return null;

    return (
      <div className="w-full h-full">
        <EpubReader key={epub.id} epub={epub} />
      </div>
    );
  },
);

export default EpubProjectItemView;
