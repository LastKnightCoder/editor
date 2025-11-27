import { useState, memo, useEffect, useMemo } from "react";
import For from "@/components/For";
import {
  Button,
  Flex,
  Input,
  message,
  Modal,
  Tabs,
  FloatButton,
  Empty,
  Checkbox,
  Select,
} from "antd";
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
import useDatabaseConnected from "@/hooks/useDatabaseConnected";
import useSettingStore from "@/stores/useSettingStore";
import usePdfsStore from "@/stores/usePdfsStore";
import useEpubsStore from "@/stores/useEpubsStore";
import useUploadResource from "@/hooks/useUploadResource";
import { v4 as uuid } from "uuid";
import PdfCard from "./PdfCard";
import EpubCard from "./EpubCard";

type FilterType = "all" | "pdf" | "epub";

const PdfListView = memo(() => {
  const [loading, setLoading] = useState(false);
  const uploadResource = useUploadResource();

  const isConnected = useDatabaseConnected();
  const active = useSettingStore((state) => state.setting.database.active);

  // PDF Store
  const { pdfs, createPdf, initPdfs } = usePdfsStore(
    useShallow((state) => ({
      pdfs: state.pdfs,
      createPdf: state.createPdf,
      initPdfs: state.initPdfs,
    })),
  );

  // EPUB Store
  const { epubs, createEpub, initEpubs } = useEpubsStore(
    useShallow((state) => ({
      epubs: state.epubs,
      createEpub: state.createEpub,
      initEpubs: state.initEpubs,
    })),
  );

  // 类型筛选器状态
  const [filterType, setFilterType] = useLocalStorageState<FilterType>(
    "book-filter-type",
    {
      defaultValue: "all",
    },
  );

  useEffect(() => {
    if (isConnected && active) {
      setLoading(true);
      Promise.all([initPdfs(), initEpubs()]).finally(() => {
        setLoading(false);
      });
    }
  }, [isConnected, active, initPdfs, initEpubs]);

  const [addBookOpen, setAddBookOpen] = useState(false);
  const [remoteUrl, setRemoteUrl] = useState("");
  const [remoteFileName, setRemoteFileName] = useState("");
  const [addType, setAddType] = useState<"pdf" | "epub">("pdf");

  // 添加上传选项状态和持久化
  const [shouldUpload, setShouldUpload] = useLocalStorageState(
    "pdf-upload-option",
    {
      defaultValue: false,
    },
  );

  // 合并并排序所有书籍
  const allBooks = useMemo(() => {
    const pdfItems = pdfs.map((pdf) => ({
      type: "pdf" as const,
      data: pdf,
      createTime: pdf.createTime,
    }));
    const epubItems = epubs.map((epub) => ({
      type: "epub" as const,
      data: epub,
      createTime: epub.createTime,
    }));

    let items = [...pdfItems, ...epubItems];

    // 根据筛选器过滤
    if (filterType === "pdf") {
      items = pdfItems;
    } else if (filterType === "epub") {
      items = epubItems;
    }

    // 按创建时间排序（最新在前）
    items.sort((a, b) => b.createTime - a.createTime);

    return items;
  }, [pdfs, epubs, filterType]);

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

  const onClickAddBook = () => {
    setAddBookOpen(true);
  };

  const onCancelAddBook = () => {
    setAddBookOpen(false);
  };

  const onSelectFile = async () => {
    const extensions = addType === "pdf" ? ["pdf"] : ["epub"];
    const typeName = addType === "pdf" ? "PDF" : "EPUB";
    const mimeType =
      addType === "pdf" ? "application/pdf" : "application/epub+zip";

    const filePath = await selectFile({
      properties: ["openFile"],
      filters: [
        {
          name: typeName,
          extensions,
        },
      ],
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

        const fileContent = (await readBinaryFile(
          filePath[0],
        )) as Uint8Array<ArrayBuffer>;
        const file = new File([fileContent], fileName, {
          type: mimeType,
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
            filePath[0],
          )) as Uint8Array<ArrayBuffer>;
          const fileForLocal = new File([fileContentForLocal], fileName, {
            type: mimeType,
          });
          finalFilePath = await copyFileToResources(fileForLocal, fileName);
        }
      } catch (error) {
        console.error("上传文件失败:", error);
        message.error({
          key: "uploading-book",
          content: "文件上传失败，将保存为本地文件",
        });
        const fileContentForLocal = (await readBinaryFile(
          filePath[0],
        )) as Uint8Array<ArrayBuffer>;
        const fileForLocal = new File([fileContentForLocal], fileName, {
          type: mimeType,
        });
        finalFilePath = await copyFileToResources(fileForLocal, fileName);
      }
    } else {
      const fileContentForLocal = (await readBinaryFile(
        filePath[0],
      )) as Uint8Array<ArrayBuffer>;
      const fileForLocal = new File([fileContentForLocal], fileName, {
        type: mimeType,
      });
      finalFilePath = await copyFileToResources(fileForLocal, fileName);
    }

    if (addType === "pdf") {
      await createPdf({
        fileName,
        filePath: finalFilePath,
        isLocal,
        remoteUrl,
        tags: [],
        category: "",
      });
    } else {
      await createEpub({
        fileName,
        filePath: finalFilePath,
        isLocal,
        remoteUrl,
        tags: [],
        category: "default",
        progressPercentage: 0,
      });
    }
    setAddBookOpen(false);
  };

  const onAddRemoteBook = async () => {
    if (!remoteUrl || !remoteFileName) {
      message.error("请填写完整信息");
      return;
    }

    if (addType === "pdf") {
      await createPdf({
        fileName: remoteFileName,
        filePath: "",
        isLocal: false,
        remoteUrl,
        tags: [],
        category: "",
      });
    } else {
      await createEpub({
        fileName: remoteFileName,
        filePath: "",
        isLocal: false,
        remoteUrl,
        tags: [],
        category: "default",
        progressPercentage: 0,
      });
    }
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
          <Flex gap={"middle"} align={"center"}>
            <span>文件类型：</span>
            <Select
              value={addType}
              onChange={(v) => setAddType(v)}
              style={{ width: 120 }}
              options={[
                { label: "PDF", value: "pdf" },
                { label: "EPUB", value: "epub" },
              ]}
            />
          </Flex>
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
            <span style={{ flex: "none" }}>文件类型：</span>
            <Select
              value={addType}
              onChange={(v) => setAddType(v)}
              style={{ width: 120 }}
              options={[
                { label: "PDF", value: "pdf" },
                { label: "EPUB", value: "epub" },
              ]}
            />
          </Flex>
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
            onClick={onAddRemoteBook}
            style={{ width: "fit-content", marginLeft: "auto" }}
          >
            添加
          </Button>
        </Flex>
      ),
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
      {/* 筛选器 */}
      <div className="px-10 pt-5 pb-2 flex items-center gap-4">
        <span className="text-gray-500">类型筛选：</span>
        <Select
          value={filterType}
          onChange={(v) => setFilterType(v)}
          style={{ width: 120 }}
          options={[
            { label: "全部", value: "all" },
            { label: "PDF", value: "pdf" },
            { label: "EPUB", value: "epub" },
          ]}
        />
        <span className="text-gray-400 text-sm ml-auto">
          共 {allBooks.length} 本
        </span>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden relative px-10 py-3 flex">
        {allBooks.length === 0 ? (
          <div className="w-full h-full flex items-center justify-center">
            <Empty description="暂无文件" />
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
              data={allBooks}
              renderItem={(item) =>
                item.type === "pdf" ? (
                  <PdfCard
                    pdf={item.data}
                    key={`pdf-${item.data.id}`}
                    style={{ height: 200 }}
                  />
                ) : (
                  <EpubCard
                    epub={item.data}
                    key={`epub-${item.data.id}`}
                    style={{ height: 200 }}
                  />
                )
              }
            />
          </div>
        )}
      </div>
      <Modal open={addBookOpen} onCancel={onCancelAddBook} footer={null}>
        <Tabs items={items} />
      </Modal>
      <FloatButton
        icon={<PlusOutlined />}
        tooltip={"添加电子书"}
        onClick={onClickAddBook}
      />
    </div>
  );
});

export default PdfListView;
