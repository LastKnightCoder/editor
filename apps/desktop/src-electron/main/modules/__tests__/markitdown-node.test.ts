import { afterEach, beforeEach, describe, expect, it } from "vitest";
import AdmZip from "adm-zip";
import { promises as fs } from "fs";
import os from "os";
import path from "path";

import { convertDocumentToMarkdown } from "../markitdown-node";

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "markitdown-node-test-"));
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
});

async function writeFixture(fileName: string, content: string | Buffer): Promise<string> {
  const filePath = path.join(tempDir, fileName);
  await fs.writeFile(filePath, content);
  return filePath;
}

/** 构造最小可解析的 docx（OOXML：Content_Types + rels + styles + document） */
function buildDocxBuffer(): Buffer {
  const zip = new AdmZip();
  zip.addFile(
    "[Content_Types].xml",
    Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`)
  );
  zip.addFile(
    "_rels/.rels",
    Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`)
  );
  zip.addFile(
    "word/_rels/document.xml.rels",
    Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`)
  );
  zip.addFile(
    "word/styles.xml",
    Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/></w:style>
</w:styles>`)
  );
  zip.addFile(
    "word/document.xml",
    Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:body>
<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>测试标题 Hello</w:t></w:r></w:p>
<w:p><w:r><w:t>这是正文段落。</w:t></w:r></w:p>
</w:body>
</w:document>`)
  );
  return zip.toBuffer();
}

/** 构造最小可解析的 EPUB（mimetype + container + OPF + spine 章节） */
function buildEpubBuffer(): Buffer {
  const zip = new AdmZip();
  zip.addFile("mimetype", Buffer.from("application/epub+zip"));
  zip.addFile(
    "META-INF/container.xml",
    Buffer.from(`<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
<rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`)
  );
  zip.addFile(
    "OEBPS/content.opf",
    Buffer.from(`<?xml version="1.0"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>测试书名</dc:title><dc:identifier id="uid">test-1</dc:identifier></metadata>
<manifest><item id="ch1" href="ch1.xhtml" media-type="application/xhtml+xml"/></manifest>
<spine><itemref idref="ch1"/></spine>
</package>`)
  );
  zip.addFile(
    "OEBPS/ch1.xhtml",
    Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml"><head><title>第一章</title></head>
<body><h1>第一章 起源</h1><p>这是章节内容。</p></body></html>`)
  );
  return zip.toBuffer();
}

describe("convertDocumentToMarkdown：纯文本类", () => {
  it("txt 原文返回，title 取首行", async () => {
    const filePath = await writeFixture("note.txt", "第一行标题\n正文内容");

    const result = await convertDocumentToMarkdown(filePath);

    expect(result.success).toBe(true);
    expect(result.textContent).toBe("第一行标题\n正文内容");
    expect(result.title).toBe("第一行标题");
    expect(result.error).toBeNull();
  });

  it("markdown 原文返回，title 取一级标题", async () => {
    const filePath = await writeFixture("note.md", "# 文档标题\n\n正文");

    const result = await convertDocumentToMarkdown(filePath);

    expect(result.success).toBe(true);
    expect(result.title).toBe("文档标题");
  });

  it("空文件返回明确的失败信息", async () => {
    const filePath = await writeFixture("empty.txt", "");

    const result = await convertDocumentToMarkdown(filePath);

    expect(result.success).toBe(false);
    expect(result.error).toBe("文档内容为空或无法提取文本");
  });
});

describe("convertDocumentToMarkdown：TSV", () => {
  it("转为 Markdown 表格并转义竖线", async () => {
    const filePath = await writeFixture("data.tsv", "名称\t数量\n苹果\t3\na|b\t1");

    const result = await convertDocumentToMarkdown(filePath);

    expect(result.success).toBe(true);
    const lines = result.textContent!.split("\n");
    expect(lines[0]).toBe("| 名称 | 数量 |");
    expect(lines[1]).toBe("| --- | --- |");
    expect(lines[2]).toBe("| 苹果 | 3 |");
    expect(lines[3]).toBe("| a\\|b | 1 |");
  });
});

describe("convertDocumentToMarkdown：HTML", () => {
  it("turndown 转换为 Markdown", async () => {
    const filePath = await writeFixture("page.html", "<h1>页面标题</h1><p>段落内容</p>");

    const result = await convertDocumentToMarkdown(filePath);

    expect(result.success).toBe(true);
    expect(result.textContent).toContain("# 页面标题");
    expect(result.textContent).toContain("段落内容");
  });
});

describe("convertDocumentToMarkdown：anydoc 支持的格式", () => {
  it("docx 输出结构化 Markdown（标题 + 段落）", async () => {
    const filePath = await writeFixture("test.docx", buildDocxBuffer());

    const result = await convertDocumentToMarkdown(filePath);

    expect(result.success).toBe(true);
    expect(result.textContent).toContain("# 测试标题 Hello");
    expect(result.textContent).toContain("这是正文段落。");
    expect(result.title).toBe("测试标题 Hello");
  });

  it("epub 按 spine 提取章节内容", async () => {
    const filePath = await writeFixture("test.epub", buildEpubBuffer());

    const result = await convertDocumentToMarkdown(filePath);

    expect(result.success).toBe(true);
    expect(result.textContent).toContain("第一章 起源");
    expect(result.textContent).toContain("这是章节内容。");
  });

  it("csv 输出 GFM 表格", async () => {
    const filePath = await writeFixture("data.csv", "name,age\nAlice,30\nBob,25");

    const result = await convertDocumentToMarkdown(filePath);

    expect(result.success).toBe(true);
    expect(result.textContent).toContain("| name | age |");
    expect(result.textContent).toContain("| Alice | 30 |");
    expect(result.textContent).toContain("| Bob | 25 |");
  });

  it("损坏的 docx 返回中文错误信息并保留原始细节", async () => {
    const filePath = await writeFixture("broken.docx", Buffer.from("not a real docx"));

    const result = await convertDocumentToMarkdown(filePath);

    expect(result.success).toBe(false);
    expect(result.error).toContain("文档已损坏或格式无效");
    expect(result.error).toContain("zip");
  });

  it("不支持的文件类型返回失败", async () => {
    const filePath = await writeFixture("archive.zip", Buffer.from("zip content"));

    const result = await convertDocumentToMarkdown(filePath);

    expect(result.success).toBe(false);
    expect(result.error).toBe("不支持的文件类型: .zip");
  });
});
