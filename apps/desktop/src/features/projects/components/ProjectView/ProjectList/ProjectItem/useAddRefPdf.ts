import { useMemo } from "react";
import { useMemoizedFn } from "ahooks";

import { Pdf, ProjectItem } from "@/types";
import { ModalKey, ModalStates } from "../../shared/constants/modalKeys";

interface UseAddRefPdfOptions {
  modalStates: ModalStates;
  openModal: (key: ModalKey) => void;
  closeModal: (key: ModalKey) => void;
  onConfirm: (pdf: Pdf) => Promise<void>;
  projectItem?: ProjectItem;
}

/** 「关联已有 PDF」弹窗的开合；选中态由 SelectPdfDialog 自己管理 */
const useAddRefPdf = (options: UseAddRefPdfOptions) => {
  const excludePdfIds = useMemo(() => {
    if (options.projectItem?.refType === "pdf" && options.projectItem.refId) {
      return [options.projectItem.refId];
    }
    return [];
  }, [options.projectItem]);

  const openSelectPdfModal = useMemoizedFn(() => options.openModal(ModalKey.SelectPdf));
  const onCancel = useMemoizedFn(() => options.closeModal(ModalKey.SelectPdf));
  const onConfirm = useMemoizedFn((pdf: Pdf) => options.onConfirm(pdf));

  return {
    excludePdfIds,
    selectPdfModalOpen: options.modalStates[ModalKey.SelectPdf],
    openSelectPdfModal,
    onCancel,
    onConfirm,
  };
};

export default useAddRefPdf;
