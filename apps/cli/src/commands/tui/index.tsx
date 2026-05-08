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
        console.error("Error: TUI mode requires an interactive terminal.");
        process.exit(1);
      }
      const { waitUntilExit } = render(<TuiApp />);
      await waitUntilExit();
    });
}
