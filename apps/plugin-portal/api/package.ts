import AdmZip from "adm-zip";
import { inflateRawSync } from "node:zlib";
import { validatePluginManifest } from "@tau/plugins/package";
import { LIMITS, type PackageContent } from "../contracts";
import { fail, sha256 } from "./platform";

function unpack(entry: AdmZip.IZipEntry): Buffer {
  const packed = entry.getCompressedData();
  const bytes =
    entry.header.method === 0
      ? packed
      : entry.header.method === 8
        ? inflateRawSync(packed, { maxOutputLength: LIMITS.expandedBytes })
        : null;
  if (!bytes || bytes.length !== entry.header.size) throw new Error("ZIP 解压大小或压缩格式无效");
  return bytes;
}

export async function inspectPackage(bytes: Uint8Array): Promise<PackageContent> {
  try {
    if (bytes.length > LIMITS.zipBytes) throw new Error("ZIP 超过8MiB");
    const zip = new AdmZip(Buffer.from(bytes));
    const entries = zip.getEntries();
    if (!entries.length || entries.length > 512) throw new Error("ZIP 文件数量无效");
    let total = 0;
    const paths = new Set<string>();
    for (const entry of entries) {
      const name = entry.entryName.replace(/\/$/, "");
      if (
        !name ||
        name.includes("\\") ||
        name.split("/").some(p => !p || p === "." || p === "..") ||
        paths.has(name) ||
        ((entry.attr >>> 16) & 0xf000) === 0xa000 ||
        entry.header.flags & 1
      ) {
        throw new Error("ZIP 含无效路径、重复文件、链接或加密条目");
      }
      paths.add(name);
      total += entry.header.size;
      if (total > LIMITS.expandedBytes) throw new Error("ZIP 解压内容超过32MiB");
    }
    const manifests = entries.filter(e => /^[^/]+\/manifest\.json$/.test(e.entryName));
    if (manifests.length !== 1) throw new Error("ZIP 必须包含单层插件目录与 manifest.json");
    if (manifests[0].header.size > 65536) throw new Error("manifest 过大");
    const raw = JSON.parse(unpack(manifests[0]).toString("utf8"));
    const manifest = validatePluginManifest(raw);
    if (
      typeof raw.description !== "string" ||
      !raw.description.trim() ||
      raw.description.length > LIMITS.summary
    )
      throw new Error("manifest.description必须为1至160字的简介");
    if (!manifest.minAppVersion) throw new Error("发布包必须声明最低客户端版本");
    if (manifest.id === "web" || manifest.id.startsWith("core."))
      throw new Error("不能使用内置插件保留ID");
    for (const entry of entries) {
      if (entry.entryName !== manifest.id + "/" && !entry.entryName.startsWith(manifest.id + "/"))
        throw new Error("ZIP 根目录必须与插件ID一致");
    }
    for (const name of [manifest.main, ...(manifest.styles ? [manifest.styles] : [])]) {
      const entry = zip.getEntry(`${manifest.id}/${name}`);
      if (!entry || entry.isDirectory) throw new Error("缺少入口或样式文件");
      const content = unpack(entry);
      if (
        content.length !== entry.header.size ||
        (await sha256(content)) !== manifest.integrity[name]
      )
        throw new Error("入口或样式摘要不匹配");
      if (name === manifest.main && !content.toString("utf8").trim())
        throw new Error("插件入口为空");
    }
    const readDocument = (name: string, required: boolean) => {
      const entry = zip.getEntry(`${manifest.id}/${name}`);
      if (!entry) {
        if (required) throw new Error(`插件包缺少${name}`);
        return null;
      }
      if (entry.isDirectory || entry.header.size > LIMITS.readmeBytes)
        throw new Error(`${name}必须是128KiB以内的文本文件`);
      const text = new TextDecoder("utf-8", { fatal: true }).decode(unpack(entry));
      if (!text.trim()) throw new Error(`${name}不能为空`);
      return text;
    };
    return {
      manifest: {
        ...manifest,
        minAppVersion: manifest.minAppVersion,
        description: raw.description.trim(),
      },
      readme: readDocument("README.md", true)!,
      changelog: readDocument("CHANGELOG.md", false),
    };
  } catch (error) {
    return fail(422, "INVALID_PACKAGE", error instanceof Error ? error.message : "无效插件包");
  }
}
