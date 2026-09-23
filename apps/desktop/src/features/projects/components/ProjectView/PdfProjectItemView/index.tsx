import { memo, useEffect, useState } from "react";

import { getPdfById, getProjectItemById } from "@/commands";
import { EProjectItemType, Pdf, ProjectItem } from "@/types";
import EditPdf from "@/components/EditPdf";
import { toast } from "@tau/ui";

interface PdfProjectItemViewProps {
  projectItemId: number;
}

const PdfProjectItemView = memo(({ projectItemId }: PdfProjectItemViewProps) => {
  const [projectItem, setProjectItem] = useState<ProjectItem | null>(null);
  const [pdf, setPdf] = useState<Pdf | null>(null);

  useEffect(() => {
    if (!projectItemId) return;

    let mounted = true;

    const load = async () => {
      try {
        const item = await getProjectItemById(projectItemId);
        if (!item || item.projectItemType !== EProjectItemType.Pdf) return;
        if (!mounted) return;
        setProjectItem(item);

        if (!item.refId) return;
        const pdfData = await getPdfById(item.refId);
        if (!mounted) return;
        setPdf(pdfData);
      } catch (error) {
        console.error("加载 PDF 项失败:", error);
        toast.error("加载 PDF 内容失败");
      }
    };

    load();

    return () => {
      mounted = false;
      setProjectItem(null);
      setPdf(null);
    };
  }, [projectItemId]);

  if (!projectItem || !pdf) return null;

  return (
    <div className="h-full w-full">
      <EditPdf key={pdf.id} pdf={pdf} />
    </div>
  );
});

export default PdfProjectItemView;
