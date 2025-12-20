import { MdFullscreen } from "react-icons/md";
import { memo } from "react";
import { Copy } from "lucide-react";
import styles from "./index.module.less";

interface ToolbarButtonsProps {
  onCopy: () => void;
  onFullscreen: () => void;
}

const ToolbarButtons = memo<ToolbarButtonsProps>(({ onCopy, onFullscreen }) => (
  <div className={styles.btnGroup}>
    <div className={styles.fullscreenButton} onClick={onFullscreen}>
      <MdFullscreen />
    </div>
    <div className={styles.divider} />
    <div className={styles.copyButton} onClick={onCopy}>
      <Copy className={styles.copyIcon} size={16} />
    </div>
  </div>
));

ToolbarButtons.displayName = "ToolbarButtons";

export default ToolbarButtons;
