import classnames from "classnames";
import For from "@/components/For";
import EditPdf from '@/layouts/ThreeColumnLayout/Content/Pdf'
import usePdfsStore from "@/stores/usePdfsStore.ts";
import PdfCard from "./PdfCard";
import styles from './index.module.less';
import { useMemoizedFn } from "ahooks";
import { useEffect, useRef, useState } from "react";
import { Button, Flex, Input, message, Modal, Tabs, FloatButton } from "antd";
import { PlusOutlined } from '@ant-design/icons';
import { open } from "@tauri-apps/api/dialog";
import { basename } from "@tauri-apps/api/path";

const MIN_WIDTH = 320;
const MAX_WIDTH = 400;
const GAP = 20;

const PdfView = () => {
  const gridContainerRef = useRef<HTMLDivElement>(null);
  const [itemWidth, setItemWidth] = useState(MIN_WIDTH);

  const { pdfs, activePdf, createPdf } = usePdfsStore(state => ({
    pdfs: state.pdfs,
    activePdf: state.activePdf,
    createPdf: state.createPdf
  }));

  const [addPdfOpen, setAddPdfOpen] = useState(false);
  const [remoteUrl, setRemoteUrl] = useState('');
  const [remoteFileName, setRemoteFileName] = useState('');

  const onClickAddPdf = async () => {
    setAddPdfOpen(true);
  }

  const onCancelAddPdf = () => {
    setAddPdfOpen(false);
  }

  const onSelectFile = async () => {
    const filePath = await open({
      multiple: false,
      directory: false,
      filters: [{
        name: 'PDF',
        extensions: ['pdf'],
      }],
    });
    if (!filePath || Array.isArray(filePath)) return;
    const fileName = await basename(filePath);
    await createPdf({
      fileName,
      filePath,
      isLocal: true,
      remoteUrl: '',
      tags: [],
      category: '',
    });
    setAddPdfOpen(false);
  }

  const onAddRemotePdf = async () => {
    if (!remoteUrl || !remoteFileName) {
      message.error('请填写完整信息');
      return;
    }
    await createPdf({
      fileName: remoteFileName,
      filePath: '',
      isLocal: false,
      remoteUrl,
      tags: [],
      category: '',
    });
    setRemoteUrl('');
    setRemoteFileName('');
    setAddPdfOpen(false);
  }

  const items = [{
    key: 'local',
    label: '本地',
    children: (
      <Button onClick={onSelectFile}>选择文件</Button>
    ),
  }, {
    key: 'remote',
    label: '远程',
    children: (
      <Flex gap={"middle"} vertical>
        <Flex gap={"middle"} align={"center"}>
          <p style={{ flex: 'none' }}>远程地址：</p>
          <Input
            value={remoteUrl}
            onChange={(e) => setRemoteUrl(e.target.value)}
          />
        </Flex>
        <Flex gap={"middle"} align={"center"}>
          <p style={{ flex: 'none' }}>文件名：</p>
          <Input
            value={remoteFileName}
            onChange={(e) => setRemoteFileName(e.target.value)}
          />
        </Flex>
        <Button onClick={onAddRemotePdf} style={{ width: 'fit-content', marginLeft: 'auto' }}>添加</Button>
      </Flex>
    ),
  }]

  const isShowEdit = activePdf !== null;

  const handleResize = useMemoizedFn((entries: ResizeObserverEntry[]) => {
    const { width } = entries[0].contentRect;

    const nMin = Math.ceil((width + GAP) / (MAX_WIDTH + GAP));
    const nMax = Math.floor((width + GAP) / (MIN_WIDTH + GAP));

    const n = Math.min(nMin, nMax);

    const itemWidth = (width + GAP) / n - GAP;

    setItemWidth(itemWidth);
  });

  useEffect(() => {
    const container = gridContainerRef.current;
    if (!container) return;

    const observer = new ResizeObserver(handleResize);

    observer.observe(container);

    return () => {
      observer.disconnect();
    }
  }, [handleResize]);

  return (
    <div className={classnames(styles.viewContainer, { [styles.showEdit]: isShowEdit })}>
      <div className={styles.gridContainer} style={{ gap: GAP }}>
        <For
          data={pdfs}
          renderItem={pdf => (
            <PdfCard pdf={pdf} key={pdf.id} style={{ width: itemWidth, height: 200 }} />
          )}
        />
      </div>
      <div className={styles.edit}>
        {
          isShowEdit && (
            <EditPdf />
          )
        }
      </div>
      <Modal
        open={addPdfOpen}
        onCancel={onCancelAddPdf}
        footer={null}
      >
        <Tabs items={items} />
      </Modal>
      <FloatButton
        icon={<PlusOutlined />}
        tooltip={'新建Pdf'}
        onClick={onClickAddPdf}
      />
    </div>
  )
}

export default PdfView;