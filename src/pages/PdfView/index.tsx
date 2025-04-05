import classnames from "classnames";
import { useShallow } from "zustand/react/shallow";
import For from "@/components/For";
import EditPdf from "./EditPdf";
import usePdfsStore from "@/stores/usePdfsStore.ts";
import PdfCard from "./PdfCard";
import styles from "./index.module.less";
import { useEffect, useState } from "react";
import {
  Button,
  Flex,
  Input,
  message,
  Modal,
  Tabs,
  FloatButton,
  Breadcrumb,
} from "antd";
import { PlusOutlined } from "@ant-design/icons";
import { selectFile, getFileBaseName } from "@/commands";
import useGridLayout from "@/hooks/useGridLayout";
import useDatabaseConnected from "@/hooks/useDatabaseConnected";
import useSettingStore from "@/stores/useSettingStore";
import Titlebar from "@/components/Titlebar";
import { useNavigate } from "react-router-dom";

const PdfView = () => {
  const navigate = useNavigate();
  const { gridContainerRef, itemWidth, gap } = useGridLayout();

  const isConnected = useDatabaseConnected();
  const active = useSettingStore((state) => state.setting.database.active);

  const { pdfs, activePdf, createPdf, initPdfs } = usePdfsStore(
    useShallow((state) => ({
      pdfs: state.pdfs,
      activePdf: state.activePdf,
      createPdf: state.createPdf,
      initPdfs: state.initPdfs,
    })),
  );

  useEffect(() => {
    if (isConnected && active) {
      initPdfs();
    }
  }, [isConnected, active, initPdfs]);

  const [addPdfOpen, setAddPdfOpen] = useState(false);
  const [remoteUrl, setRemoteUrl] = useState("");
  const [remoteFileName, setRemoteFileName] = useState("");

  const onClickAddPdf = async () => {
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

  const isShowEdit = activePdf !== null;

  // 面包屑导航
  const breadcrumbItems = [
    { title: "首页", onClick: () => navigate("/") },
    {
      title: "PDF列表",
      onClick: () => {
        usePdfsStore.setState({
          activePdf: null,
        });
      },
    },
  ];

  return (
    <div
      className={classnames(styles.viewContainer, {
        [styles.showEdit]: isShowEdit,
      })}
    >
      <Titlebar className={styles.titlebar}>
        <Breadcrumb
          className={styles.breadcrumb}
          items={breadcrumbItems.map((item) => ({
            title: (
              <span className={styles.breadcrumbItem} onClick={item.onClick}>
                {item.title}
              </span>
            ),
          }))}
        />
      </Titlebar>
      <div className={styles.editContainer}>
        <div
          ref={gridContainerRef}
          className={styles.gridContainer}
          style={{ gap }}
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
        <div className={styles.edit}>{isShowEdit && <EditPdf />}</div>
      </div>
      <Modal open={addPdfOpen} onCancel={onCancelAddPdf} footer={null}>
        <Tabs items={items} />
      </Modal>
      <FloatButton
        icon={<PlusOutlined />}
        tooltip={"新建Pdf"}
        onClick={onClickAddPdf}
      />
    </div>
  );
};

export default PdfView;
