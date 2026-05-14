import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import "@xterm/xterm/css/xterm.css";
import {
  createTerminal as createPty,
  writeTerminal,
  resizeTerminal,
  destroyTerminal,
  onTerminalData,
  offTerminalData,
  onTerminalExit,
  offTerminalExit,
} from "@/commands/terminal";
import useTerminalStore from "@/stores/useTerminalStore";
import useTerminalTheme from "./useTerminalTheme";

interface TerminalInstanceProps {
  instanceId: string;
  cwd: string;
  visible: boolean;
}

const TerminalInstance: React.FC<TerminalInstanceProps> = ({
  instanceId,
  cwd,
  visible,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const ptyIdRef = useRef<string | null>(null);
  const initializedRef = useRef(false);
  const theme = useTerminalTheme();

  const { markInstanceDead } = useTerminalStore();

  useEffect(() => {
    if (!containerRef.current || initializedRef.current) return;
    initializedRef.current = true;

    const terminal = new Terminal({
      theme,
      fontSize: 13,
      fontFamily:
        "'JetBrains Mono', 'Fira Code', 'Cascadia Code', Menlo, monospace",
      cursorBlink: true,
      cursorStyle: "bar",
      allowProposedApi: true,
      scrollback: 5000,
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();

    terminal.loadAddon(fitAddon);
    terminal.loadAddon(webLinksAddon);
    terminal.open(containerRef.current);

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;

    setTimeout(() => {
      try {
        fitAddon.fit();
      } catch {
        // ignore
      }
    }, 0);

    const dataListener = (
      _event: unknown,
      payload: { id: string; data: string },
    ) => {
      if (payload.id === ptyIdRef.current) {
        terminal.write(payload.data);
      }
    };

    const exitListener = (
      _event: unknown,
      payload: { id: string; exitCode: number },
    ) => {
      if (payload.id === ptyIdRef.current) {
        terminal.write(
          `\r\n\x1b[90m[Process exited with code ${payload.exitCode}]\x1b[0m\r\n`,
        );
        markInstanceDead(instanceId);
        ptyIdRef.current = null;
      }
    };

    onTerminalData(dataListener);
    onTerminalExit(exitListener);

    const { cols, rows } = terminal;
    createPty({ cwd, cols, rows }).then(({ id }) => {
      ptyIdRef.current = id;
    });

    terminal.onData((data) => {
      if (ptyIdRef.current) {
        writeTerminal(ptyIdRef.current, data);
      }
    });

    const resizeObserver = new ResizeObserver(() => {
      if (fitAddonRef.current && terminalRef.current) {
        try {
          fitAddonRef.current.fit();
          const { cols, rows } = terminalRef.current;
          if (ptyIdRef.current) {
            resizeTerminal(ptyIdRef.current, cols, rows);
          }
        } catch {
          // ignore
        }
      }
    });

    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    return () => {
      resizeObserver.disconnect();
      offTerminalData(dataListener);
      offTerminalExit(exitListener);
      if (ptyIdRef.current) {
        destroyTerminal(ptyIdRef.current);
      }
      terminal.dispose();
    };
  }, []);

  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.options.theme = theme;
    }
  }, [theme]);

  useEffect(() => {
    if (visible && terminalRef.current && fitAddonRef.current) {
      requestAnimationFrame(() => {
        try {
          fitAddonRef.current!.fit();
          const { cols, rows } = terminalRef.current!;
          if (ptyIdRef.current) {
            resizeTerminal(ptyIdRef.current, cols, rows);
          }
        } catch {
          // ignore
        }
        terminalRef.current?.focus();
      });
    }
  }, [visible]);

  return (
    <div
      ref={containerRef}
      style={{
        width: "100%",
        height: "100%",
        position: visible ? "relative" : "absolute",
        visibility: visible ? "visible" : "hidden",
        pointerEvents: visible ? "auto" : "none",
        left: visible ? undefined : "-9999px",
      }}
    />
  );
};

export default TerminalInstance;
