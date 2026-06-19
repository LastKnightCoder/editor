import { useMemo } from "react";
import { App } from "antd";
import { useMemoizedFn } from "ahooks";
import { v4 as getUuid } from "uuid";
import {
  WebviewUrlInputForm,
  type WebviewUrlInputFormServices,
} from "@tau/shared";

import Board from "../../Board";
import useUploadResource from "@/hooks/useUploadResource";
import { selectFile, readTextFile, getFileBaseName } from "@/commands";
import CustomModal from "@/components/CustomModal";

interface WebviewSelectorModalProps {
  open: boolean;
  onClose: () => void;
  board: Board;
}

const DEFAULT_URL = "https://www.google.com";

const WebviewSelectorModal = ({
  open,
  onClose,
  board,
}: WebviewSelectorModalProps) => {
  const uploadResource = useUploadResource();
  const { message } = App.useApp();

  const services = useMemo<WebviewUrlInputFormServices>(
    () => ({
      selectFile,
      readTextFile,
      getFileBaseName,
      uploadResource: async (file: File) => {
        const result = await uploadResource(file);
        return result ?? undefined;
      },
    }),
    [uploadResource],
  );

  const handleClose = useMemoizedFn(() => {
    onClose();
  });

  const handleOk = useMemoizedFn(
    ({ url, sourceType }: { url: string; sourceType: "remote" | "local" }) => {
      const { minX, minY, width, height } = board.viewPort;
      const center = {
        x: minX + width / 2,
        y: minY + height / 2,
      };

      const webviewWidth = 600;
      const webviewHeight = 400;

      board.apply({
        type: "insert_node",
        path: [board.children.length],
        node: {
          id: getUuid(),
          type: "webview",
          url: url || DEFAULT_URL,
          sourceType,
          x: center.x - webviewWidth / 2,
          y: center.y - webviewHeight / 2,
          width: webviewWidth,
          height: webviewHeight,
        },
      });

      handleClose();
    },
  );

  return (
    <CustomModal
      title={null}
      open={open}
      footer={null}
      showCloseButton={false}
      width={460}
      centered
      onCancel={handleClose}
    >
      <WebviewUrlInputForm
        services={services}
        notify={{
          error: (msg) => message.error(msg),
          success: (msg) => message.success(msg),
        }}
        onOk={handleOk}
        onCancel={handleClose}
      />
    </CustomModal>
  );
};

export default WebviewSelectorModal;
