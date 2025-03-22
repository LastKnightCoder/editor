import { MdFullscreen } from "react-icons/md";
import { memo } from "react";
import styles from "./index.module.less";
import SVG from "react-inlinesvg";
import copyIcon from "@/assets/icons/copy.svg";

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
      <SVG src={copyIcon} className={styles.copyIcon} />
    </div>
  </div>
));

ToolbarButtons.displayName = "ToolbarButtons";

export default ToolbarButtons;
