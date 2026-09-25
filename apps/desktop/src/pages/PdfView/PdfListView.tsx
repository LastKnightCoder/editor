import { useState, memo, useMemo } from "react";
import For from "@/components/For";
import { Button, Flex, Input, message, Modal, Tabs, FloatButton, Empty, Checkbox } from "antd";
import { PlusOutlined, LoadingOutlined } from "@ant-design/icons";
import { useShallow } from "zustand/react/shallow";
import { useLocalStorageState } from "ahooks";

import {
  selectFile,
  getFileBaseName,
  getEditorDir,
  getSep,
  createDir,
  pathExists,
  writeBinaryFile,
  readBinaryFile,
} from "@/commands";
import { useDatabaseChangeEffect } from "@/hooks/useDatabaseChangeEffect";
import usePdfsStore from "@/stores/usePdfsStore";
import useUploadResource from "@/hooks/useUploadResource";
import { v4 as uuid } from "uuid";
import PdfCard from "./PdfCard";

const PdfListView = memo(() => {
  const [loading, setLoading] = useState(false);
  const uploadResource = useUploadResource();

  const { pdfs, createPdf, initPdfs } = usePdfsStore(
    useShallow(state => ({
      pdfs: state.pdfs,
      createPdf: state.createPdf,
      initPdfs: state.initPdfs,
    }))
  );

  // 在数据库连接或切换时加载电子书数据
  useDatabaseChangeEffect(() => {
    setLoading(true);
    initPdfs().finally(() => {
      setLoading(false);
    });
  });

  const [addBookOpen, setAddBookOpen] = useState(false);
  const [remoteUrl, setRemoteUrl] = useState("");
  const [remoteFileName, setRemoteFileName] = useState("");

  // 添加上传选项状态和持久化
  const [shouldUpload, setShouldUpload] = useLocalStorageState("pdf-upload-option", {
    defaultValue: false,
  });

  // 按创建时间排序（最新在前）
  const sortedPdfs = useMemo(() => {
    return [...pdfs].sort((a, b) => b.createTime - a.createTime);
  }, [pdfs]);

  // 复制文件到 resources 目录的函数
  const copyFileToResources = async (file: File, fileName = file.name) => {
    const editorPath = await getEditorDir();
    const sep = await getSep();
    const resourceDirPath = editorPath + sep + "resources";
    if (!(await pathExists(resourceDirPath))) {
      await createDir(resourceDirPath);
    }

    const all = fileName.split(".");
    const other = all.slice(0, all.length - 1);
    const extension = all[all.length - 1];
    const objectName = other.join(".") + "_" + uuid() + "." + extension;

    const resourcePath = resourceDirPath + sep + objectName;
    await writeBinaryFile(resourcePath, new Uint8Array(await file.arrayBuffer()));
    return resourcePath;
  };

  const onClickAddBook = () => {
    setAddBookOpen(true);
  };

  const onCancelAddBook = () => {
    setAddBookOpen(false);
  };

  const onSelectFile = async () => {
    const filePath = await selectFile({
      properties: ["openFile"],
      filters: [{ name: "PDF", extensions: ["pdf"] }],
    });
    if (!filePath || filePath.length > 1) return;

    const fileName = await getFileBaseName(filePath[0]);

    let finalFilePath = filePath[0];
    let isLocal = true;
    let remoteUrl = "";

    if (shouldUpload) {
      try {
        message.loading({
          key: "uploading-book",
          content: "正在上传文件...",
          duration: 0,
        });

        const fileContent = (await readBinaryFile(filePath[0])) as Uint8Array<ArrayBuffer>;
        const file = new File([fileContent], fileName, {
          type: "application/pdf",
        });

        const uploadedUrl = await uploadResource(file);
        if (uploadedUrl) {
          finalFilePath = "";
          isLocal = false;
          remoteUrl = uploadedUrl;
          message.success({ key: "uploading-book", content: "文件上传成功" });
        } else {
          message.error({
            key: "uploading-book",
            content: "文件上传失败，将保存为本地文件",
          });
          const fileContentForLocal = (await readBinaryFile(
            filePath[0]
          )) as Uint8Array<ArrayBuffer>;
          const fileForLocal = new File([fileContentForLocal], fileName, {
            type: "application/pdf",
          });
          finalFilePath = await copyFileToResources(fileForLocal, fileName);
        }
      } catch (error) {
        console.error("上传文件失败:", error);
        message.error({
          key: "uploading-book",
          content: "文件上传失败，将保存为本地文件",
        });
        const fileContentForLocal = (await readBinaryFile(filePath[0])) as Uint8Array<ArrayBuffer>;
        const fileForLocal = new File([fileContentForLocal], fileName, {
          type: "application/pdf",
        });
        finalFilePath = await copyFileToResources(fileForLocal, fileName);
      }
    } else {
      const fileContentForLocal = (await readBinaryFile(filePath[0])) as Uint8Array<ArrayBuffer>;
      const fileForLocal = new File([fileContentForLocal], fileName, {
        type: "application/pdf",
      });
      finalFilePath = await copyFileToResources(fileForLocal, fileName);
    }

    await createPdf({
      fileName,
      filePath: finalFilePath,
      isLocal,
      remoteUrl,
      tags: [],
      category: "",
    });
    setAddBookOpen(false);
  };

  const onAddRemoteBook = async () => {
    if (!remoteUrl || !remoteFileName) {
      message.error("请填写完整信息");
      return;
    }

    await createPdf({
      fileName: remoteFileName,
      filePath: "",
      isLocal: false,
      remoteUrl,
      tags: [],
      category: "",
    });
    setRemoteUrl("");
    setRemoteFileName("");
    setAddBookOpen(false);
  };

  const items = [
    {
      key: "local",
      label: "本地",
      children: (
        <Flex gap={"middle"} vertical>
          <Checkbox checked={shouldUpload} onChange={e => setShouldUpload(e.target.checked)}>
            上传到云端（会根据设置中的图床配置上传）
          </Checkbox>
          <Button onClick={onSelectFile}>选择文件</Button>
        </Flex>
      ),
    },
    {
      key: "remote",
      label: "远程",
      children: (
        <Flex gap={"middle"} vertical>
          <Flex gap={"middle"} align={"center"}>
            <p style={{ flex: "none" }}>远程地址：</p>
            <Input value={remoteUrl} onChange={e => setRemoteUrl(e.target.value)} />
          </Flex>
          <Flex gap={"middle"} align={"center"}>
            <p style={{ flex: "none" }}>文件名：</p>
            <Input value={remoteFileName} onChange={e => setRemoteFileName(e.target.value)} />
          </Flex>
          <Button onClick={onAddRemoteBook} style={{ width: "fit-content", marginLeft: "auto" }}>
            添加
          </Button>
        </Flex>
      ),
    },
  ];

  if (loading) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-4 text-gray-500">
        <LoadingOutlined style={{ fontSize: 24 }} />
        <p>加载中...</p>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col">
      <div className="flex items-center gap-4 px-10 pb-2 pt-5">
        <span className="ml-auto text-sm text-gray-400">共 {sortedPdfs.length} 本</span>
      </div>

      <div className="relative flex min-h-0 flex-1 overflow-hidden px-10 py-3">
        {sortedPdfs.length === 0 ? (
          <div className="flex h-full w-full items-center justify-center">
            <Empty description="暂无文件" />
          </div>
        ) : (
          <div
            className="scrollbar-hide box-border h-full min-w-0 flex-1 overflow-y-auto"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
              gap: 20,
              alignContent: "flex-start",
            }}
          >
            <For
              data={sortedPdfs}
              renderItem={pdf => (
                <PdfCard pdf={pdf} key={`pdf-${pdf.id}`} style={{ height: 200 }} />
              )}
            />
          </div>
        )}
      </div>
      <Modal open={addBookOpen} onCancel={onCancelAddBook} footer={null}>
        <Tabs items={items} />
      </Modal>
      <FloatButton icon={<PlusOutlined />} tooltip={"添加 PDF"} onClick={onClickAddBook} />
    </div>
  );
});

export default PdfListView;
