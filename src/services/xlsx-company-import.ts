import { inflateRawSync } from "node:zlib";
import type { CompanyMonitorCandidate } from "@/src/services/company-monitoring-ai";

type ZipEntry = {
  name: string;
  data: Buffer;
};

type WorkbookRow = Record<string, string>;

const companySheetName = "公司清单";

function xmlText(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function getAttr(value: string, name: string) {
  const match = value.match(new RegExp(`${name}="([^"]*)"`));
  return match?.[1];
}

function columnIndex(cellRef: string) {
  const letters = cellRef.match(/[A-Z]+/)?.[0] ?? "A";
  return letters.split("").reduce((sum, char) => sum * 26 + char.charCodeAt(0) - 64, 0) - 1;
}

function parseZipEntries(buffer: Buffer): Map<string, ZipEntry> {
  const eocdSignature = 0x06054b50;
  let eocdOffset = -1;

  for (let index = buffer.length - 22; index >= 0; index -= 1) {
    if (buffer.readUInt32LE(index) === eocdSignature) {
      eocdOffset = index;
      break;
    }
  }

  if (eocdOffset < 0) {
    throw new Error("无法读取 Excel 文件结构。");
  }

  const centralDirectoryOffset = buffer.readUInt32LE(eocdOffset + 16);
  const entries = new Map<string, ZipEntry>();
  let offset = centralDirectoryOffset;

  while (offset < eocdOffset && buffer.readUInt32LE(offset) === 0x02014b50) {
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const fileNameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.subarray(offset + 46, offset + 46 + fileNameLength).toString("utf8");

    const localFileNameLength = buffer.readUInt16LE(localHeaderOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localHeaderOffset + 28);
    const dataStart = localHeaderOffset + 30 + localFileNameLength + localExtraLength;
    const compressedData = buffer.subarray(dataStart, dataStart + compressedSize);
    const data = method === 8 ? inflateRawSync(compressedData) : Buffer.from(compressedData);

    entries.set(name, { name, data });
    offset += 46 + fileNameLength + extraLength + commentLength;
  }

  return entries;
}

function parseSharedStrings(xml: string) {
  return Array.from(xml.matchAll(/<si[^>]*>([\s\S]*?)<\/si>/g)).map((match) => {
    return Array.from(match[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g))
      .map((textMatch) => xmlText(textMatch[1]))
      .join("");
  });
}

function resolveWorksheetPath(entries: Map<string, ZipEntry>) {
  const workbookXml = entries.get("xl/workbook.xml")?.data.toString("utf8");
  const relsXml = entries.get("xl/_rels/workbook.xml.rels")?.data.toString("utf8");

  if (!workbookXml || !relsXml) {
    return "xl/worksheets/sheet1.xml";
  }

  const sheetMatch =
    Array.from(workbookXml.matchAll(/<sheet\s+[^>]*>/g)).find((match) => getAttr(match[0], "name") === companySheetName) ??
    workbookXml.match(/<sheet\s+[^>]*>/);

  const relId = sheetMatch ? getAttr(sheetMatch[0], "r:id") : undefined;
  const relMatch = relId ? Array.from(relsXml.matchAll(/<Relationship\s+[^>]*>/g)).find((match) => getAttr(match[0], "Id") === relId) : undefined;
  const target = relMatch ? getAttr(relMatch[0], "Target") : undefined;

  if (!target) {
    return "xl/worksheets/sheet1.xml";
  }

  return target.startsWith("xl/") ? target : `xl/${target}`;
}

function parseCellValue(cellXml: string, sharedStrings: string[]) {
  const type = getAttr(cellXml, "t");

  if (type === "inlineStr") {
    return xmlText(Array.from(cellXml.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)).map((match) => match[1]).join(""));
  }

  const value = cellXml.match(/<v[^>]*>([\s\S]*?)<\/v>/)?.[1] ?? "";

  if (type === "s") {
    return sharedStrings[Number(value)] ?? "";
  }

  return xmlText(value);
}

function parseWorksheetRows(xml: string, sharedStrings: string[]) {
  return Array.from(xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)).map((rowMatch) => {
    const row: string[] = [];

    for (const cellMatch of rowMatch[1].matchAll(/<c\s+([^>]*)>([\s\S]*?)<\/c>/g)) {
      const ref = getAttr(cellMatch[1], "r") ?? "A1";
      row[columnIndex(ref)] = parseCellValue(cellMatch[0], sharedStrings).trim();
    }

    return row;
  });
}

function worksheetToObjects(rows: string[][]): WorkbookRow[] {
  const header = rows[0] ?? [];

  return rows.slice(1).map((row) => {
    const item: WorkbookRow = {};

    header.forEach((key, index) => {
      if (key) {
        item[key] = row[index] ?? "";
      }
    });

    return item;
  });
}

function splitTags(value: string) {
  return value
    .split(/[,，、/；;｜|]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function pickFirst(row: WorkbookRow, keys: string[]) {
  for (const key of keys) {
    const value = row[key]?.trim();
    if (value) {
      return value;
    }
  }

  return "";
}

function priorityFromValue(value: string) {
  const trimmed = value.trim().toUpperCase();

  if (trimmed === "A") return 3;
  if (trimmed === "B") return 2;
  if (trimmed === "C") return 1;

  const numeric = Number(trimmed);
  return Number.isFinite(numeric) ? Math.max(0, Math.min(3, Math.round(numeric))) : 1;
}

function buildCompanyName(row: WorkbookRow) {
  const standardName = pickFirst(row, ["公司", "公司名", "公司名称", "企业", "企业名称"]);
  const englishName = row["公司英文/品牌"]?.trim();
  const chineseName = row["中文名"]?.trim();

  if (standardName) {
    return standardName;
  }

  if (englishName && chineseName && englishName !== chineseName) {
    return `${englishName} ${chineseName}`;
  }

  return chineseName || englishName || "";
}

function rowToCandidate(row: WorkbookRow): CompanyMonitorCandidate | null {
  const name = buildCompanyName(row);
  const careerUrl = pickFirst(row, ["招聘入口", "投递入口", "招聘链接", "招聘网址", "校招入口", "官网招聘入口", "careerUrl"]);

  const tags = Array.from(
    new Set([
      ...splitTags(row["标签"] ?? ""),
      row["大类"],
      row["子方向"],
      ...splitTags(row["主要地区/城市"] ?? ""),
      ...splitTags(row["城市"] ?? ""),
      ...splitTags(row["方向"] ?? ""),
      ...splitTags(row["岗位关键词"] ?? "")
    ].filter(Boolean))
  );

  if (!name || !careerUrl || tags.length === 0) {
    return null;
  }
  const reasonParts = [
    row["业务与投递切入点"],
    row["BME匹配点"],
    row["备注"]
  ].filter(Boolean);

  return {
    name,
    careerUrl: careerUrl || undefined,
    tags,
    priority: priorityFromValue(row["建议优先级"] ?? ""),
    reason: reasonParts.length ? reasonParts.join("；") : "从公司清单 Excel 导入的候选监控公司。"
  };
}

export function parseCompanyCandidatesFromXlsx(arrayBuffer: ArrayBuffer) {
  const entries = parseZipEntries(Buffer.from(arrayBuffer));
  const sharedStringsXml = entries.get("xl/sharedStrings.xml")?.data.toString("utf8") ?? "";
  const sharedStrings = sharedStringsXml ? parseSharedStrings(sharedStringsXml) : [];
  const worksheetPath = resolveWorksheetPath(entries);
  const worksheetXml = entries.get(worksheetPath)?.data.toString("utf8");

  if (!worksheetXml) {
    throw new Error("Excel 中未找到公司清单工作表。");
  }

  return worksheetToObjects(parseWorksheetRows(worksheetXml, sharedStrings))
    .map(rowToCandidate)
    .filter((item): item is CompanyMonitorCandidate => Boolean(item));
}
