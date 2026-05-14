import { useCallback, useEffect, useRef } from "react";
import useTerminalStore from "@/stores/useTerminalStore";
import { initTerminalModule } from "@/commands/terminal";
import TerminalTabs from "./TerminalTabs";
import TerminalInstance from "./TerminalInstance";
import styles from "./index.module.less";

interface TerminalPanelProps {
  cwd: string;
}

const TerminalPanel: React.FC<TerminalPanelProps> = ({ cwd }) => {
  const {
    panelOpen,
    instances,
    activeId,
    panelPosition,
    panelHeight,
    panelWidth,
    setPanelHeight,
    setPanelWidth,
    setPanelOpen,
    addInstance,
    moduleInitialized,
    setModuleInitialized,
  } = useTerminalStore();

  const resizeRef = useRef<{
    startPos: number;
    startSize: number;
  } | null>(null);

  const ensureModuleReady = useCallback(async () => {
    if (!moduleInitialized) {
      await initTerminalModule();
      setModuleInitialized(true);
    }
  }, [moduleInitialized, setModuleInitialized]);

  const handleNewTerminal = useCallback(async () => {
    await ensureModuleReady();
    const id = `inst-${Date.now()}`;
    addInstance({
      id,
      title: "",
      cwd,
      isAlive: true,
    });
  }, [cwd, ensureModuleReady, addInstance]);

  const handleClosePanel = useCallback(() => {
    setPanelOpen(false);
  }, [setPanelOpen]);

  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const isBottom = panelPosition === "bottom";
      resizeRef.current = {
        startPos: isBottom ? e.clientY : e.clientX,
        startSize: isBottom ? panelHeight : panelWidth,
      };

      const handleMouseMove = (e: MouseEvent) => {
        if (!resizeRef.current) return;
        const isBottom = panelPosition === "bottom";
        const delta =
          resizeRef.current.startPos - (isBottom ? e.clientY : e.clientX);
        const newSize = Math.max(
          150,
          Math.min(600, resizeRef.current.startSize + delta),
        );
        if (isBottom) {
          setPanelHeight(newSize);
        } else {
          setPanelWidth(newSize);
        }
      };

      const handleMouseUp = () => {
        resizeRef.current = null;
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = isBottom ? "row-resize" : "col-resize";
      document.body.style.userSelect = "none";
    },
    [panelPosition, panelHeight, panelWidth, setPanelHeight, setPanelWidth],
  );

  // Auto-create first terminal when panel opens with no instances
  const hasAutoCreated = useRef(false);
  useEffect(() => {
    if (panelOpen && instances.length === 0 && !hasAutoCreated.current) {
      hasAutoCreated.current = true;
      handleNewTerminal();
    }
    if (instances.length > 0) {
      hasAutoCreated.current = false;
    }
  }, [panelOpen, instances.length, handleNewTerminal]);

  // Panel is hidden via CSS, not unmounted
  if (!panelOpen) {
    return (
      <div style={{ display: "none" }}>
        {instances.map((instance) => (
          <TerminalInstance
            key={instance.id}
            instanceId={instance.id}
            cwd={instance.cwd}
            visible={false}
          />
        ))}
      </div>
    );
  }

  if (instances.length === 0) {
    return null;
  }

  const isBottom = panelPosition === "bottom";
  const panelStyle = isBottom
    ? { height: panelHeight, minHeight: 150 }
    : { width: panelWidth, minWidth: 150 };

  return (
    <div
      className={`${styles.terminalPanel} ${isBottom ? styles.bottom : styles.right}`}
      style={panelStyle}
    >
      <div
        className={`${styles.resizeHandle} ${isBottom ? styles.horizontal : styles.vertical}`}
        onMouseDown={handleResizeStart}
      />
      <TerminalTabs
        onNewTerminal={handleNewTerminal}
        onClosePanel={handleClosePanel}
      />
      <div className={styles.terminalContent}>
        {instances.map((instance) => (
          <TerminalInstance
            key={instance.id}
            instanceId={instance.id}
            cwd={instance.cwd}
            visible={instance.id === activeId}
          />
        ))}
      </div>
    </div>
  );
};

export default TerminalPanel;
