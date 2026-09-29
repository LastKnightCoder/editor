import { memo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loading } from "@tau/ui";

import { getProjectItemById } from "@/commands";
import { ErrorState } from "@/components/ErrorState";
import { EProjectItemType } from "@/types";
import { usePdfDetail } from "@/features/pdfs/queries";
import { PdfReader } from "@/features/pdfs/reader/PdfReader";

interface PdfProjectItemViewProps {
  projectItemId: number;
}

/**
 * 项目里的 PDF 条目：条目只存 refId，文件与标注都在 PDF 域——与 PDF 阅读页共用阅读器和缓存
 * （在 PDF 列表里改名、上传后这里跟着更新）。独立阅读器没有对话，左面板开关在 HUD。
 */
const PdfProjectItemView = memo(({ projectItemId }: PdfProjectItemViewProps) => {
  const item = useQuery({
    queryKey: ["projects", "pdf-item", projectItemId],
    queryFn: () => getProjectItemById(projectItemId),
    staleTime: 30_000,
  });
  const refId =
    item.data?.projectItemType === EProjectItemType.Pdf && item.data.refId ? item.data.refId : 0;
  const { pdf, loading } = usePdfDetail(refId);

  if (item.isPending || (refId && loading)) return <Loading />;
  if (item.error || !refId || !pdf) {
    return (
      <ErrorState
        size="page"
        error={item.error ?? undefined}
        title="PDF 不存在"
        description="关联的 PDF 可能已在 PDF 页面被删除，可以删除这个条目后重新关联。"
      />
    );
  }

  return (
    <div className="flex h-full min-h-0 w-full">
      <PdfReader key={pdf.id} pdf={pdf} />
    </div>
  );
});

export default PdfProjectItemView;
