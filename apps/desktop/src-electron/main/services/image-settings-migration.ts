import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

export async function migrateImageSettings(
  setting: Record<string, unknown>,
  appDir: string,
  save: (next: Record<string, unknown>) => Promise<void>
): Promise<Record<string, unknown>> {
  const imageGeneration = setting.imageGeneration as
    { currentProviderId?: unknown; providers?: unknown } | undefined;
  if (
    !Array.isArray(imageGeneration?.providers) ||
    !imageGeneration.providers.some(
      item => item && typeof item === "object" && Object.hasOwn(item, "providerType")
    )
  )
    return setting;
  await writeFile(
    join(appDir, `setting.json.images-${randomUUID()}.bak`),
    JSON.stringify(setting, null, 2),
    { flag: "wx", mode: 0o600 }
  );
  const providers = imageGeneration.providers.map(item => {
    if (!item || typeof item !== "object") throw new Error("图片账号格式无效，原设置已备份");
    if (typeof item.pluginId === "string") {
      const {
        providerType: _type,
        baseUrl: _url,
        apiKey: _key,
        modelName: _model,
        ...current
      } = item;
      return current;
    }
    if (item.providerType !== "openai") throw new Error("发现无法迁移的图片提供方，原设置已备份");
    return {
      id: item.id,
      name: item.name,
      pluginId: "tau.images-openai",
      modelId: item.modelName,
      config: { baseUrl: item.baseUrl, apiKey: item.apiKey },
    };
  });
  const next = { ...setting, imageGeneration: { ...imageGeneration, providers } };
  await save(next);
  return next;
}
