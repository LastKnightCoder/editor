import { afterEach, expect, it, vi } from "vitest";
import { createEditor } from "slate";
import { createEditorKit } from "@tau/editor";
import { desktopLocaleSource } from "@/app/i18n/runtime";
import { VideoController } from "../../VideoController";
import { createVideoTimestampExtension } from "../VideoTimestamp";
import { createVideoScreenshotExtension } from "../VideoScreenshot";
afterEach(() => desktopLocaleSource.setLocale("zh-CN"));
it("装配后换语只改变标题，不替换命令或触发控制器，显式命令仍使用原控制器", () => {
  const controller = new VideoController(() => null);
  const play = vi.spyOn(controller, "play");
  const pause = vi.spyOn(controller, "pause");
  const capture = vi.spyOn(controller, "captureVideoFrame");
  const kit = createEditorKit({
    extensions: [
      createVideoTimestampExtension(controller),
      createVideoScreenshotExtension(controller),
    ],
  });
  const registry = kit.assembly.commands;
  const command = registry.get("host.video-note.play")?.command;
  if (!command) throw new Error("missing play command");
  const run = command.run;
  const title = command.title;
  const plugins = kit.assembly.plugins;
  for (const locale of ["en-US", "zh-TW"] as const) {
    desktopLocaleSource.setLocale(locale);
    expect(command.title).not.toBe(title);
    expect(registry.get(command.id)?.command).toBe(command);
    expect(command.run).toBe(run);
    expect(kit.assembly.plugins).toBe(plugins);
    expect(play).not.toHaveBeenCalled();
    expect(pause).not.toHaveBeenCalled();
    expect(capture).not.toHaveBeenCalled();
  }
  command.run(createEditor(), {});
  expect(play).toHaveBeenCalledTimes(1);
  expect(capture).not.toHaveBeenCalled();
});
