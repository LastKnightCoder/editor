import React from "react";
import { render } from "ink";
import type { Command } from "commander";
import { TuiApp } from "./app.js";

export function registerTuiCommand(program: Command) {
  program
    .command("tui")
    .description("Launch interactive TUI mode")
    .action(async () => {
      if (!process.stdin.isTTY) {
        if (process.platform === "win32") {
          console.error(
            "Error: TUI mode requires an interactive terminal (TTY).",
          );
          console.error("");
          console.error(
            "On Windows, the Electron-based CLI (ELECTRON_RUN_AS_NODE) may not",
          );
          console.error(
            "support interactive terminal mode. Possible workarounds:",
          );
          console.error(
            "  1. Run from Windows Terminal or PowerShell using tau.ps1",
          );
          console.error(
            "  2. Use a standalone Node.js (>=20) to run dist/index.js directly",
          );
        } else {
          console.error("Error: TUI mode requires an interactive terminal.");
        }
        process.exit(1);
      }
      const { waitUntilExit } = render(<TuiApp />);
      await waitUntilExit();
    });
}
