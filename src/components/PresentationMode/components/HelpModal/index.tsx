import { CloseOutlined } from "@ant-design/icons";
import styles from "./index.module.less";

// 帮助模态框组件
const HelpModal = ({ onClose }: { onClose: () => void }) => {
  return (
    <div className={styles.helpModal} onClick={onClose}>
      <div
        className={styles.helpModalContent}
        onClick={(e) => e.stopPropagation()}
      >
        <CloseOutlined
          className={styles.helpModalCloseIcon}
          onClick={onClose}
        />
        <h3>演示模式快捷键</h3>

        <h4>基本操作</h4>
        <ul>
          <li>
            <kbd>ESC</kbd> 退出演示模式
          </li>
          <li>
            <kbd>←</kbd> <kbd>→</kbd> 切换幻灯片
          </li>
          <li>
            <kbd>D</kbd> 切换深色/浅色主题
          </li>
          <li>
            <kbd>O</kbd> 进入全览模式
          </li>
          <li>
            <kbd>F</kbd> 进入全屏模式
          </li>
          <li>
            <kbd>Ctrl+H</kbd> / <kbd>⌘+H</kbd> 显示/隐藏帮助
          </li>
        </ul>

        <h4>全览模式</h4>
        <ul>
          <li>
            <kbd>↑</kbd> <kbd>↓</kbd> <kbd>←</kbd> <kbd>→</kbd> 导航选择幻灯片
          </li>
          <li>
            <kbd>Enter</kbd> 进入选中的幻灯片
          </li>
          <li>
            <kbd>ESC</kbd> 退出全览
          </li>
          <li>点击幻灯片直接进入该幻灯片</li>
        </ul>
      </div>
    </div>
  );
};

export default HelpModal;
