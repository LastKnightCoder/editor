import { ZipReader, Uint8ArrayReader, Uint8ArrayWriter } from "@zip.js/zip.js";

export async function readWordPackage(bytes: Uint8Array) {
  const zip = new ZipReader(new Uint8ArrayReader(bytes), { useWebWorkers: false });
  try {
    const entries = await zip.getEntries();
    const read = async (part: string) => {
      const entry = entries.find(item => item.filename === part);
      if (!entry || entry.directory) throw new Error(`缺少 ${part}`);
      return new DOMParser().parseFromString(
        new TextDecoder().decode(await entry.getData(new Uint8ArrayWriter())),
        "application/xml"
      );
    };
    return {
      document: await read("word/document.xml"),
      relationships: await read("word/_rels/document.xml.rels"),
    };
  } finally {
    await zip.close();
  }
}
