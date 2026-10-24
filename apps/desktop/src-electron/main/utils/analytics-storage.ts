import fsp from "node:fs/promises";
import type { AnalyticsState, AnalyticsStorage } from "@tau/analytics/client";

export class FileAnalyticsStorage implements AnalyticsStorage {
  constructor(private readonly filename: string) {}

  async read(): Promise<unknown> {
    try {
      return JSON.parse(await fsp.readFile(this.filename, "utf8"));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }

  async write(state: AnalyticsState): Promise<void> {
    const temporary = this.filename + ".tmp";
    await fsp.writeFile(temporary, JSON.stringify(state), { encoding: "utf8", mode: 0o600 });
    await fsp.rename(temporary, this.filename);
  }
}
