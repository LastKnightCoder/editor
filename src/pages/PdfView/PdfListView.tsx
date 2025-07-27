import { useState, memo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import For from "@/components/For";
import {
  Button,
  Flex,
  Input,
  message,
  Modal,
  Tabs,
  FloatButton,
  Breadcrumb,
  Empty,
  Checkbox,
} from "antd";
import { PlusOutlined, LoadingOutlined } from "@ant-design/icons";
import { useShallow } from "zustand/react/shallow";
import { useLocalStorageState } from "ahooks";

import Titlebar from "@/components/Titlebar";
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
import useDatabaseConnected from "@/hooks/useDatabaseConnected";
import useSettingStore from "@/stores/useSettingStore";
import usePdfsStore from "@/stores/usePdfsStore";
import useUploadResource from "@/hooks/useUploadResource";
import { v4 as uuid } from "uuid";
import PdfCard from "./PdfCard";

const PdfListView = memo(() => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const uploadResource = useUploadResource();

  const isConnected = useDatabaseConnected();
  const active = useSettingStore((state) => state.setting.database.active);

  const { pdfs, createPdf, initPdfs } = usePdfsStore(
    useShallow((state) => ({
      pdfs: state.pdfs,
      createPdf: state.createPdf,
      initPdfs: state.initPdfs,
    })),
  );

  useEffect(() => {
    if (isConnected && active) {
      setLoading(true);
      initPdfs().finally(() => {
        setLoading(false);
      });
    }
  }, [isConnected, active, initPdfs]);

  const [addPdfOpen, setAddPdfOpen] = useState(false);
  const [remoteUrl, setRemoteUrl] = useState("");
  const [remoteFileName, setRemoteFileName] = useState("");

  // 添加上传选项状态和持久化
  const [shouldUpload, setShouldUpload] = useLocalStorageState(
    "pdf-upload-option",
    {
      defaultValue: false,
    },
  );

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
    await writeBinaryFile(
      resourcePath,
      new Uint8Array(await file.arrayBuffer()),
    );
    return resourcePath;
  };

  const onClickAddPdf = () => {
    setAddPdfOpen(true);
  };

  const onCancelAddPdf = () => {
    setAddPdfOpen(false);
  };

  const onSelectFile = async () => {
    const filePath = await selectFile({
      properties: ["openFile"],
      filters: [
        {
          name: "PDF",
          extensions: ["pdf"],
        },
      ],
    });
    if (!filePath || filePath.length > 1) return;

    const fileName = await getFileBaseName(filePath[0]);

    let finalFilePath = filePath[0];
    let isLocal = true;
    let remoteUrl = "";

    if (shouldUpload) {
      // 上传文件
      try {
        message.loading({
          key: "uploading-pdf",
          content: "正在上传文件...",
          duration: 0,
        });

        // 读取文件内容并创建 File 对象
        const fileContent = await readBinaryFile(filePath[0]);
        const file = new File([fileContent], fileName, {
          type: "application/pdf",
        });

        const uploadedUrl = await uploadResource(file);
        if (uploadedUrl) {
          finalFilePath = "";
          isLocal = false;
          remoteUrl = uploadedUrl;
          message.success({ key: "uploading-pdf", content: "文件上传成功" });
        } else {
          message.error({
            key: "uploading-pdf",
            content: "文件上传失败，将保存为本地文件",
          });
          // 上传失败，复制到本地 resources 目录
          const fileContentForLocal = await readBinaryFile(filePath[0]);
          const fileForLocal = new File([fileContentForLocal], fileName, {
            type: "application/pdf",
          });
          finalFilePath = await copyFileToResources(fileForLocal, fileName);
        }
      } catch (error) {
        console.error("上传文件失败:", error);
        message.error({
          key: "uploading-pdf",
          content: "文件上传失败，将保存为本地文件",
        });
        // 上传失败，复制到本地 resources 目录
        const fileContentForLocal = await readBinaryFile(filePath[0]);
        const fileForLocal = new File([fileContentForLocal], fileName, {
          type: "application/pdf",
        });
        finalFilePath = await copyFileToResources(fileForLocal, fileName);
      }
    } else {
      // 不上传，复制到本地 resources 目录
      const fileContentForLocal = await readBinaryFile(filePath[0]);
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
    setAddPdfOpen(false);
  };

  const onAddRemotePdf = async () => {
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
    setAddPdfOpen(false);
  };

  const items = [
    {
      key: "local",
      label: "本地",
      children: (
        <Flex gap={"middle"} vertical>
          <Checkbox
            checked={shouldUpload}
            onChange={(e) => setShouldUpload(e.target.checked)}
          >
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
            <Input
              value={remoteUrl}
              onChange={(e) => setRemoteUrl(e.target.value)}
            />
          </Flex>
          <Flex gap={"middle"} align={"center"}>
            <p style={{ flex: "none" }}>文件名：</p>
            <Input
              value={remoteFileName}
              onChange={(e) => setRemoteFileName(e.target.value)}
            />
          </Flex>
          <Button
            onClick={onAddRemotePdf}
            style={{ width: "fit-content", marginLeft: "auto" }}
          >
            添加
          </Button>
        </Flex>
      ),
    },
  ];

  // 面包屑导航
  const breadcrumbItems = [
    { title: "首页", onClick: () => navigate("/") },
    {
      title: "PDF列表",
      onClick: () => {
        // 当前页面，不需要操作
      },
    },
  ];

  if (loading) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center gap-4 text-gray-500">
        <LoadingOutlined style={{ fontSize: 24 }} />
        <p>加载中...</p>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col">
      <Titlebar className="w-full h-15 flex-shrink-0">
        <Breadcrumb
          className="h-15 pl-10! flex items-center app-region-no-drag"
          items={breadcrumbItems.map((item) => ({
            title: (
              <span
                className="cursor-pointer transition-all duration-300 ease-in-out px-2 py-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800"
                onClick={item.onClick}
              >
                {item.title}
              </span>
            ),
          }))}
        />
      </Titlebar>
      <div className="flex-1 min-h-0 overflow-hidden relative px-10 py-5 flex">
        {pdfs.length === 0 ? (
          <div className="w-full h-full flex items-center justify-center">
            <Empty description="暂无PDF文件" />
          </div>
        ) : (
          <div
            className="flex-1 min-w-0 h-full overflow-y-auto scrollbar-hide box-border"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
              gap: 20,
              alignContent: "flex-start",
            }}
          >
            <For
              data={pdfs}
              renderItem={(pdf) => (
                <PdfCard pdf={pdf} key={pdf.id} style={{ height: 200 }} />
              )}
            />
          </div>
        )}
      </div>
      <Modal open={addPdfOpen} onCancel={onCancelAddPdf} footer={null}>
        <Tabs items={items} />
      </Modal>
      <FloatButton
        icon={<PlusOutlined />}
        tooltip={"新建PDF"}
        onClick={onClickAddPdf}
      />
    </div>
  );
});

export default PdfListView;
