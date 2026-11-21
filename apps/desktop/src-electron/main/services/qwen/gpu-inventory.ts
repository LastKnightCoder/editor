import type { QwenHardwareReport } from "../../../../shared/local-transcription";

interface VulkanDevice {
  index: number;
  description: string;
  type: string;
}

/** 设备索引属于当前这次枚举；设置与实际转录共用同一份优先顺序。 */
export function vulkanDevices(catalog: unknown): VulkanDevice[] {
  if (
    !catalog ||
    typeof catalog !== "object" ||
    !("devices" in catalog) ||
    !Array.isArray(catalog.devices)
  )
    throw new Error("Qwen 返回的设备列表无效");
  const devices = catalog.devices.filter(
    (item): item is VulkanDevice =>
      item?.backend === "vulkan" &&
      ["gpu", "igpu", "dgpu"].includes(item.type) &&
      Number.isSafeInteger(item.index) &&
      item.index >= 0 &&
      typeof item.description === "string" &&
      item.description.trim().length > 0 &&
      !/llvmpipe|lavapipe|swiftshader|software|basic render driver/i.test(item.description)
  );
  return devices.sort(
    (a, b) =>
      Number(a.type === "igpu") - Number(b.type === "igpu") ||
      Number(/nvidia|geforce|quadro/i.test(b.description)) -
        Number(/nvidia|geforce|quadro/i.test(a.description)) ||
      a.index - b.index
  );
}

interface WindowsAdapter {
  Name: string;
  Vendor?: string;
  ConfigManagerErrorCode?: number;
  InfFilename?: string;
}

export function windowsAdapterReport(rows: unknown, loaderInstalled: boolean): QwenHardwareReport {
  if (!Array.isArray(rows)) throw new Error("Windows 返回的显卡列表无效");
  const adapters = rows.filter(
    (row): row is WindowsAdapter => typeof row?.Name === "string" && !!row.Name.trim()
  );
  const candidate =
    loaderInstalled &&
    adapters.some(
      adapter =>
        adapter.ConfigManagerErrorCode === 0 &&
        /^(1002|10de|8086)$/i.test(adapter.Vendor ?? "") &&
        !!adapter.InfFilename &&
        !/^(basicdisplay|display)\.inf$/i.test(adapter.InfFilename) &&
        !/microsoft basic|remote display|software|虚拟显示|基本显示/i.test(adapter.Name)
    );
  return {
    state: candidate ? "candidate" : "cpu",
    names: adapters.map(adapter => adapter.Name.trim()),
  };
}
