import { useMemoizedFn } from "ahooks";
import useWhiteBoardStore from "@/stores/useWhiteBoardStore";
import For from "@/components/For";
import classnames from "classnames";
import { App } from "antd";
import { CloseOutlined } from "@ant-design/icons";
import { WhiteBoard } from "@/types";
import defaultSnapshot from '@/assets/default-snapshot.png';

import styles from './index.module.less';

const WhiteBoardList = () => {
  const {
    whiteBoards,
    activeWhiteBoardId,
    deleteWhiteBoard,
  } = useWhiteBoardStore(state => ({
    whiteBoards: state.whiteBoards,
    deleteWhiteBoard: state.deleteWhiteBoard,
    activeWhiteBoardId: state.activeWhiteBoardId,
  }));

  const {
    modal,
  } = App.useApp();

  const onClickWhiteBoard = useMemoizedFn((whiteBoard: WhiteBoard) => {
    useWhiteBoardStore.setState({
      activeWhiteBoardId: whiteBoard.id === activeWhiteBoardId ? null : whiteBoard.id,
    });
  });

  const onRemoveWhiteBoard = (whiteBoard: WhiteBoard) => {
    modal.confirm({
      title: '删除白板',
      content: '确定删除该白板吗？',
      onOk: async () => {
        await deleteWhiteBoard(whiteBoard.id);
        if (whiteBoard.id === activeWhiteBoardId) {
          useWhiteBoardStore.setState({
            activeWhiteBoardId: null,
          });
        }
      },
      cancelText: '取消',
      okText: '确定',
      okButtonProps: {
        danger: true,
      },
    });
  }

  return (
    <div className={styles.list}>
      <For data={whiteBoards} renderItem={(item) => (
        <div 
          key={item.id} 
          className={classnames(styles.item, {
            [styles.active]: item.id === activeWhiteBoardId,
          })}
          onClick={() => onClickWhiteBoard(item)}
        >
          <img src={item.snapshot || defaultSnapshot} alt={item.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          <div className={styles.title}>{item.title}</div>
          <div className={styles.description}>{item.description}</div>
          <div 
            style={{
              position: 'absolute', 
              top: 10,
              right: 10,
              cursor: 'pointer',
            }}
            onClick={(e) => {
              e.stopPropagation();
              onRemoveWhiteBoard(item);
            }}
          >
            <CloseOutlined />
          </div>
        </div>
      )} />
    </div>
  )
}

export default WhiteBoardList;