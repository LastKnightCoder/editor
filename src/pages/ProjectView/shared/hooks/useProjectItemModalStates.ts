import { useCallback, useState } from "react";
import { ModalKey, ModalStates } from "../constants/modalKeys";

export const useProjectItemModalStates = () => {
  const [modalStates, setModalStates] = useState<ModalStates>({
    [ModalKey.WebVideo]: false,
    [ModalKey.Webview]: false,
    [ModalKey.Bilibili]: false,
    [ModalKey.Youtube]: false,
    [ModalKey.Notion]: false,
    [ModalKey.NotionSync]: false,
  });

  const openModal = useCallback((key: ModalKey) => {
    setModalStates((prev) => ({ ...prev, [key]: true }));
  }, []);

  const closeModal = useCallback((key: ModalKey) => {
    setModalStates((prev) => ({ ...prev, [key]: false }));
  }, []);

  return { modalStates, openModal, closeModal };
};
