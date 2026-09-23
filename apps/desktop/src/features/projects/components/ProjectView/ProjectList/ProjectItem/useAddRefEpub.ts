import { useMemo, useState } from "react";
import { useMemoizedFn } from "ahooks";

import { Epub, ProjectItem } from "@/types";
import { ModalKey, ModalStates } from "../../shared/constants/modalKeys";
import { toast } from "@tau/ui";

interface UseAddRefEpubOptions {
  modalStates: ModalStates;
  openModal: (key: ModalKey) => void;
  closeModal: (key: ModalKey) => void;
  onConfirm: (epub: Epub | null) => Promise<void>;
  projectItem?: ProjectItem;
}

const useAddRefEpub = (epubs: Epub[], options: UseAddRefEpubOptions) => {
  const [selectedEpub, setSelectedEpub] = useState<Epub | null>(null);

  const excludeEpubIds = useMemo(() => {
    if (options.projectItem?.refType === "epub" && options.projectItem.refId) {
      return [options.projectItem.refId];
    }
    return [];
  }, [options.projectItem]);

  const openSelectEpubModal = useMemoizedFn(() => {
    if (options.projectItem?.refType === "epub" && options.projectItem.refId) {
      const current = epubs.find(epub => epub.id === options.projectItem?.refId);
      setSelectedEpub(current || null);
    } else {
      setSelectedEpub(null);
    }
    options.openModal(ModalKey.SelectEpub);
  });

  const onCancel = useMemoizedFn(() => {
    setSelectedEpub(null);
    options.closeModal(ModalKey.SelectEpub);
  });

  const onOk = useMemoizedFn(async () => {
    if (!selectedEpub) {
      toast.warning("请选择 EPUB 文件");
      return;
    }
    await options.onConfirm(selectedEpub);
    setSelectedEpub(null);
  });

  const onSelect = useMemoizedFn((epub: Epub) => {
    setSelectedEpub(epub);
  });

  return {
    epubs,
    excludeEpubIds,
    selectEpubModalOpen: options.modalStates[ModalKey.SelectEpub],
    openSelectEpubModal,
    onCancel,
    onOk,
    selectedEpubId: selectedEpub?.id ?? null,
    onSelect,
  };
};

export default useAddRefEpub;
