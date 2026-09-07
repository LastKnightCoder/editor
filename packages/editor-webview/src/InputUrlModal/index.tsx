import React, { useMemo } from "react";
import { message } from "antd";
import { WebviewUrlInputForm, type WebviewUrlInputFormServices } from "@tau/shared";
import { WebLinkSourceType } from "../types";
import type { WebviewUrlSourceType } from "@tau/shared";
import { Editor } from "slate";
import { IFileService, IResourceService } from "@tau/editor";

interface InputUrlModalProps {
  editor: Editor;
  onOk: (payload: { url: string; sourceType: WebLinkSourceType }) => void;
  onCancel: () => void;
  defaultValue?: string;
  defaultSourceType?: WebLinkSourceType;
  title?: string;
  subtitle?: string;
  okText?: string;
}

const toFormSourceType = (source: WebLinkSourceType): WebviewUrlSourceType =>
  source === WebLinkSourceType.LOCAL ? "local" : "remote";

const InputUrlModal: React.FC<InputUrlModalProps> = ({
  editor,
  onOk,
  onCancel,
  defaultValue = "",
  defaultSourceType = WebLinkSourceType.REMOTE,
  title,
  subtitle,
  okText,
}) => {
  const services = useMemo<WebviewUrlInputFormServices>(
    () => ({
      selectFile: editor.getService(IFileService).select,
      readTextFile: editor.getService(IFileService).readText,
      getFileBaseName: editor.getService(IFileService).getBaseName,
      uploadResource: (file: File) => editor.getService(IResourceService).upload(file),
    }),
    [editor]
  );

  return (
    <WebviewUrlInputForm
      services={services}
      defaultValue={defaultValue}
      defaultSourceType={toFormSourceType(defaultSourceType)}
      title={title}
      subtitle={subtitle}
      okText={okText}
      notify={{
        error: msg => message.error(msg),
        success: msg => message.success(msg),
      }}
      onOk={({ url, sourceType }) =>
        onOk({
          url,
          sourceType: sourceType === "local" ? WebLinkSourceType.LOCAL : WebLinkSourceType.REMOTE,
        })
      }
      onCancel={onCancel}
    />
  );
};

export default InputUrlModal;
