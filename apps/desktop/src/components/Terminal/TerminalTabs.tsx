import { useState, useRef, useEffect } from "react";
import { Plus, X, PanelBottom, PanelRight, Minus } from "lucide-react";
import useTerminalStore from "@/stores/useTerminalStore";
import type { PanelPosition } from "@/stores/useTerminalStore";
import styles from "./index.module.less";

interface TerminalTabsProps {
  onNewTerminal: () => void;
  onClosePanel: () => void;
}

const TerminalTabs: React.FC<TerminalTabsProps> = ({
  onNewTerminal,
  onClosePanel,
}) => {
  const {
    instances,
    activeId,
    panelPosition,
    setActiveId,
    removeInstance,
    setPanelPosition,
    updateInstanceTitle,
  } = useTerminalStore();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingId && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingId]);

  const handleDoubleClick = (
    id: string,
    currentTitle: string,
    index: number,
  ) => {
    setEditingId(id);
    setEditValue(currentTitle || `Terminal ${index + 1}`);
  };

  const handleRenameConfirm = () => {
    if (editingId) {
      updateInstanceTitle(editingId, editValue.trim());
      setEditingId(null);
    }
  };

  const handleRenameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleRenameConfirm();
    } else if (e.key === "Escape") {
      setEditingId(null);
    }
  };

  const handleClose = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    removeInstance(id);
  };

  const togglePosition = () => {
    const next: PanelPosition = panelPosition === "bottom" ? "right" : "bottom";
    setPanelPosition(next);
  };

  return (
    <div className={styles.tabBar}>
      <div className={styles.tabs}>
        {instances.map((instance, index) => (
          <div
            key={instance.id}
            className={`${styles.tab} ${instance.id === activeId ? styles.active : ""}`}
            onClick={() => setActiveId(instance.id)}
            onDoubleClick={() =>
              handleDoubleClick(instance.id, instance.title, index)
            }
          >
            {editingId === instance.id ? (
              <input
                ref={inputRef}
                className={styles.tabInput}
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onBlur={handleRenameConfirm}
                onKeyDown={handleRenameKeyDown}
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <>
                <span className={styles.tabTitle}>
                  {instance.title || `Terminal ${index + 1}`}
                </span>
                <span
                  className={styles.tabClose}
                  onClick={(e) => handleClose(e, instance.id)}
                >
                  <X size={12} />
                </span>
              </>
            )}
          </div>
        ))}
        <button className={styles.newTabBtn} onClick={onNewTerminal}>
          <Plus size={14} />
        </button>
      </div>
      <div className={styles.tabActions}>
        <button
          className={styles.actionBtn}
          onClick={togglePosition}
          title={panelPosition === "bottom" ? "移到右侧" : "移到底部"}
        >
          {panelPosition === "bottom" ? (
            <PanelRight size={14} />
          ) : (
            <PanelBottom size={14} />
          )}
        </button>
        <button
          className={styles.actionBtn}
          onClick={onClosePanel}
          title="隐藏终端面板"
        >
          <Minus size={14} />
        </button>
      </div>
    </div>
  );
};

export default TerminalTabs;
