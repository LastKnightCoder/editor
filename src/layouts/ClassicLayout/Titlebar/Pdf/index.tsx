import { Button, Flex, Input, message, Modal, Tabs } from "antd";
import { useState } from "react";
import TitlebarIcon from "@/components/TitlebarIcon";
import ListOpen from '../components/ListOpen';
import FocusMode from "../components/FocusMode";

import usePdfsStore from "@/stores/usePdfsStore.ts";
import { PlusOutlined } from "@ant-design/icons";
import { open } from "@tauri-apps/api/dialog";
import { basename } from "@tauri-apps/api/path";

import styles from './index.module.less';

const PdfTitlebar = () => {
  const [addPdfOpen, setAddPdfOpen] = useState(false);
  const [remoteUrl, setRemoteUrl] = useState('');
  const [remoteFileName, setRemoteFileName] = useState('');

  const {
    createPdf,
  } = usePdfsStore(state => ({
    pdfs: state.pdfs,
    createPdf: state.createPdf,
  }));

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

  return (
    <div className={styles.iconList}>
      <ListOpen />
      <TitlebarIcon onClick={onClickAddPdf}>
        <PlusOutlined />
      </TitlebarIcon>
      <FocusMode />
      <Modal
        open={addPdfOpen}
        onCancel={onCancelAddPdf}
        footer={null}
      >
        <Tabs items={items} />
      </Modal>
    </div>
  )
}

export default PdfTitlebar;