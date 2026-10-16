/**
 * CSV 解析（RFC 4180）：引号包裹的字段可含逗号、换行与 "" 转义；兼容 BOM 与 CRLF。
 * 首行为表头；行宽不齐时按表头补空 / 截断，整行为空的跳过。
 */

export interface CsvTable {
  headers: string[];
  rows: string[][];
}

export const parseCsvRecords = (text: string): string[][] => {
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let quoted = false;
  const input = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    if (quoted) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
    } else if (char === '"' && field === "") {
      quoted = true;
    } else if (char === ",") {
      record.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && input[i + 1] === "\n") i += 1;
      record.push(field);
      records.push(record);
      record = [];
      field = "";
    } else {
      field += char;
    }
  }
  if (field !== "" || record.length > 0) {
    record.push(field);
    records.push(record);
  }
  return records;
};

export const parseCsv = (text: string): CsvTable => {
  const [headerRow = [], ...body] = parseCsvRecords(text);
  const headers = headerRow.map((header, index) => header.trim() || `列 ${index + 1}`);
  const rows = body
    .filter(row => row.some(cell => cell.trim() !== ""))
    .map(row => headers.map((_, index) => row[index] ?? ""));
  return { headers, rows };
};
