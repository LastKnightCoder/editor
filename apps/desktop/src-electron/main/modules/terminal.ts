import { ipcMain, type IpcMainInvokeEvent, type WebContents } from "electron";
import { spawn as ptySpawn, type IPty } from "node-pty";
import { platform } from "node:os";
import { Module } from "../types/module";

interface PtyRegistration {
  id: string;
  pty: IPty;
  senderId: number;
  sender: WebContents;
}

class TerminalModule implements Module {
  name: string;
  private ptys = new Map<string, PtyRegistration>();
  private senderPtyIds = new Map<number, Set<string>>();
  private senderCleanupRegistered = new Set<number>();
  private idCounter = 0;

  constructor() {
    this.name = "terminal";
  }

  async init() {
    ipcMain.handle(
      "terminal:create",
      async (
        event: IpcMainInvokeEvent,
        opts: { cwd: string; cols: number; rows: number },
      ) => {
        return this.createPty(event.sender, opts);
      },
    );

    ipcMain.handle(
      "terminal:write",
      async (
        _event: IpcMainInvokeEvent,
        payload: { id: string; data: string },
      ) => {
        this.writePty(payload.id, payload.data);
      },
    );

    ipcMain.handle(
      "terminal:resize",
      async (
        _event: IpcMainInvokeEvent,
        payload: { id: string; cols: number; rows: number },
      ) => {
        this.resizePty(payload.id, payload.cols, payload.rows);
      },
    );

    ipcMain.handle(
      "terminal:destroy",
      async (_event: IpcMainInvokeEvent, payload: { id: string }) => {
        this.destroyPty(payload.id);
      },
    );
  }

  private getDefaultShell(): string {
    if (platform() === "win32") {
      return process.env.COMSPEC || "cmd.exe";
    }
    return process.env.SHELL || "/bin/zsh";
  }

  private createPty(
    sender: WebContents,
    opts: { cwd: string; cols: number; rows: number },
  ): { id: string } {
    const id = `terminal-${++this.idCounter}`;
    const shell = this.getDefaultShell();

    const pty = ptySpawn(shell, [], {
      name: "xterm-256color",
      cols: opts.cols || 80,
      rows: opts.rows || 24,
      cwd: opts.cwd,
      env: process.env as Record<string, string>,
    });

    const registration: PtyRegistration = {
      id,
      pty,
      senderId: sender.id,
      sender,
    };

    this.ptys.set(id, registration);
    this.ensureSenderCleanup(sender);
    this.trackSenderPtyId(sender.id, id);

    pty.onData((data) => {
      if (!sender.isDestroyed()) {
        sender.send("terminal:data", { id, data });
      }
    });

    pty.onExit(({ exitCode }) => {
      if (!sender.isDestroyed()) {
        sender.send("terminal:exit", { id, exitCode });
      }
      this.removePtyRegistration(id);
    });

    return { id };
  }

  private writePty(id: string, data: string): void {
    const registration = this.ptys.get(id);
    if (registration) {
      registration.pty.write(data);
    }
  }

  private resizePty(id: string, cols: number, rows: number): void {
    const registration = this.ptys.get(id);
    if (registration) {
      registration.pty.resize(cols, rows);
    }
  }

  private destroyPty(id: string): void {
    const registration = this.ptys.get(id);
    if (registration) {
      registration.pty.kill();
      this.removePtyRegistration(id);
    }
  }

  private removePtyRegistration(id: string): void {
    this.ptys.delete(id);
    for (const [senderId, ids] of this.senderPtyIds) {
      ids.delete(id);
      if (ids.size === 0) {
        this.senderPtyIds.delete(senderId);
      }
    }
  }

  private ensureSenderCleanup(sender: WebContents): void {
    const senderId = sender.id;
    if (this.senderCleanupRegistered.has(senderId)) {
      return;
    }
    this.senderCleanupRegistered.add(senderId);
    sender.once("destroyed", () => {
      this.cleanupSender(senderId);
    });
  }

  private trackSenderPtyId(senderId: number, ptyId: string): void {
    const ids = this.senderPtyIds.get(senderId) ?? new Set<string>();
    ids.add(ptyId);
    this.senderPtyIds.set(senderId, ids);
  }

  private cleanupSender(senderId: number): void {
    const ids = this.senderPtyIds.get(senderId);
    if (ids) {
      for (const id of ids) {
        const registration = this.ptys.get(id);
        if (registration) {
          registration.pty.kill();
          this.ptys.delete(id);
        }
      }
    }
    this.senderPtyIds.delete(senderId);
    this.senderCleanupRegistered.delete(senderId);
  }
}

export default new TerminalModule();
