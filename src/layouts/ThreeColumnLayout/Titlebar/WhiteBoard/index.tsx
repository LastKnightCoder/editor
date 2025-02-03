import TitlebarIcon from "@/components/TitlebarIcon";
import { PlusOutlined } from "@ant-design/icons";
import FocusMode from "../../../../components/FocusMode";
import { Input, Flex, Modal, App } from "antd";

import styles from './index.module.less';
import useWhiteBoardStore from "@/stores/useWhiteBoardStore";
import { useState } from "react";

const WhiteBoard = () => {

  const [createWhiteBoardModalOpen, setCreateWhiteBoardModalOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const { message } = App.useApp();

  const {
    createWhiteBoard,
  } = useWhiteBoardStore(state => ({
    createWhiteBoard: state.createWhiteBoard,
  }));
  
  return (
    <div className={styles.iconList}>
      <TitlebarIcon tip={'新建白板'} onClick={() => setCreateWhiteBoardModalOpen(true)}>
        <PlusOutlined />
      </TitlebarIcon>
      <FocusMode />
      <Modal
        closeIcon={null}
        open={createWhiteBoardModalOpen}
        onCancel={() => setCreateWhiteBoardModalOpen(false)}
        onOk={async () => {
          if (!title) {
            message.error('请输入标题');
            return;
          }
          if (!description) {
            message.error('请输入描述');
            return;
          }
          const createWhiteBoardData = {
            title,
            description,
            tags: [],
            data: {
              children: [],
              viewPort: {
                zoom: 1,
                minX: 0,
                minY: 0,
                width: 0,
                height: 0
              },
              selection: {
                selectArea: null,
                selectedElements: [],
              },
            },
            snapshot: '',
            isProjectItem: false,
          }
          const whiteBoard = await createWhiteBoard(createWhiteBoardData);
          setCreateWhiteBoardModalOpen(false);
          setTitle('');
          setDescription('');
          useWhiteBoardStore.setState({
            activeWhiteBoardId: whiteBoard.id,
          });
        }}
      >
        <Flex gap={"middle"} vertical>
          <Flex gap={"middle"} align={"center"}>
            <p style={{ flex: 'none', margin: 0 }}>标题：</p>
            <Input placeholder="请输入标题" value={title} onChange={(e) => setTitle(e.target.value)} />
          </Flex>
          <Flex gap={"middle"} align={"start"}>
            <p style={{ flex: 'none', margin: 0 }}>描述：</p>
            <Input.TextArea placeholder="请输入描述" value={description} onChange={(e) => setDescription(e.target.value)} />
          </Flex>
        </Flex>
      </Modal>
    </div>
  )
}

export default WhiteBoard;