import { useMemo, useState } from "react";
import { useMemoizedFn } from "ahooks";

import { Pdf, ProjectItem } from "@/types";
import { ModalKey, ModalStates } from "../../shared/constants/modalKeys";
import { toast } from "@tau/ui";

interface UseAddRefPdfOptions {
  modalStates: ModalStates;
  openModal: (key: ModalKey) => void;
  closeModal: (key: ModalKey) => void;
  onConfirm: (pdf: Pdf | null) => Promise<void>;
  projectItem?: ProjectItem;
}

const useAddRefPdf = (pdfs: Pdf[], options: UseAddRefPdfOptions) => {
  const [selectedPdf, setSelectedPdf] = useState<Pdf | null>(null);

  const excludePdfIds = useMemo(() => {
    if (options.projectItem?.refType === "pdf" && options.projectItem.refId) {
      return [options.projectItem.refId];
    }
    return [];
  }, [options.projectItem]);

  const openSelectPdfModal = useMemoizedFn(() => {
    if (options.projectItem?.refType === "pdf" && options.projectItem.refId) {
      const current = pdfs.find(pdf => pdf.id === options.projectItem?.refId);
      setSelectedPdf(current || null);
    } else {
      setSelectedPdf(null);
    }
    options.openModal(ModalKey.SelectPdf);
  });

  const onCancel = useMemoizedFn(() => {
    setSelectedPdf(null);
    options.closeModal(ModalKey.SelectPdf);
  });

  const onOk = useMemoizedFn(async () => {
    if (!selectedPdf) {
      toast.warning("请选择 PDF 文件");
      return;
    }
    await options.onConfirm(selectedPdf);
    setSelectedPdf(null);
  });

  const onSelect = useMemoizedFn((pdf: Pdf) => {
    setSelectedPdf(pdf);
  });

  return {
    pdfs,
    excludePdfIds,
    selectPdfModalOpen: options.modalStates[ModalKey.SelectPdf],
    openSelectPdfModal,
    onCancel,
    onOk,
    selectedPdfId: selectedPdf?.id ?? null,
    onSelect,
  };
};

export default useAddRefPdf;
