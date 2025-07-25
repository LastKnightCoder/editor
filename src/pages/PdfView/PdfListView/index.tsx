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
} from "antd";
import { PlusOutlined, LoadingOutlined } from "@ant-design/icons";
import { useShallow } from "zustand/react/shallow";
import classnames from "classnames";

import Titlebar from "@/components/Titlebar";
import { selectFile, getFileBaseName } from "@/commands";
import useGridLayout from "@/hooks/useGridLayout";
import useDatabaseConnected from "@/hooks/useDatabaseConnected";
import useSettingStore from "@/stores/useSettingStore";
import usePdfsStore from "@/stores/usePdfsStore";
import PdfCard from "../PdfCard";

const PdfListView = memo(() => {
  const navigate = useNavigate();
  const { gridContainerRef, itemWidth, gap } = useGridLayout();
  const [loading, setLoading] = useState(false);

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
    await createPdf({
      fileName,
      filePath: filePath[0],
      isLocal: true,
      remoteUrl: "",
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
      children: <Button onClick={onSelectFile}>选择文件</Button>,
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
          className="h-15 pl-10 flex items-center app-region-no-drag"
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
      <div className="flex-1 overflow-hidden relative">
        {pdfs.length === 0 ? (
          <div className="w-full h-full flex items-center justify-center">
            <Empty description="暂无PDF文件" />
          </div>
        ) : (
          <div
            ref={gridContainerRef}
            className="flex flex-wrap w-full h-full overflow-y-auto box-border"
            style={{ gap, alignContent: "flex-start", padding: "20px 40px" }}
          >
            <For
              data={pdfs}
              renderItem={(pdf) => (
                <PdfCard
                  pdf={pdf}
                  key={pdf.id}
                  style={{ width: itemWidth, height: 200 }}
                />
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
