import { execFileSync } from "node:child_process";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const EXPECTED_COMMIT = "190ba73862e65b1b7c293289beb2ef915c1803ff";
const EXPECTED_HTML_FILES = 344;
const EXPECTED_STATBLOCK_PAGES = 290;
const EXPECTED_RECORDS = 424;
const workspace = process.cwd();
const sourceRepo = path.resolve(process.argv[2] ?? path.join(workspace, "work", "dnd5e-chm-190ba7"));
const sourceRoot = path.join(sourceRepo, "怪物图鉴");
const outputPath = path.join(workspace, "data", "srd51-monsters.zh-CN.json");
const auditPath = path.join(workspace, "data", "srd51-monsters.audit.json");
const decoder = new TextDecoder("gbk");

const SECTION_KEYS = new Map([
  ["特质", "special_abilities"],
  ["动作", "actions"],
  ["附赠动作", "bonus_actions"],
  ["奖励动作", "bonus_actions"],
  ["反应", "reactions"],
  ["传奇动作", "legendary_actions"],
  ["巢穴动作", "lair_actions"],
]);

const ABILITY_NAMES = {
  力量: "strength",
  敏捷: "dexterity",
  体质: "constitution",
  智力: "intelligence",
  感知: "wisdom",
  魅力: "charisma",
};

const FIELD_LABELS = {
  豁免: "saving_throws",
  技能: "skills",
  装备: "gear",
  伤害易伤: "damage_vulnerabilities",
  易伤: "damage_vulnerabilities",
  伤害抗性: "damage_resistances",
  抗性: "damage_resistances",
  伤害免疫: "damage_immunities",
  状态免疫: "condition_immunities",
  感官: "senses_text",
  语言: "languages",
};

const XP_BY_CR = {
  0: 10, 0.125: 25, 0.25: 50, 0.5: 100, 1: 200, 2: 450, 3: 700, 4: 1100, 5: 1800,
  6: 2300, 7: 2900, 8: 3900, 9: 5000, 10: 5900, 11: 7200, 12: 8400, 13: 10000,
  14: 11500, 15: 13000, 16: 15000, 17: 18000, 18: 20000, 19: 22000, 20: 25000,
  21: 33000, 22: 41000, 23: 50000, 24: 62000, 25: 75000, 26: 90000, 27: 105000,
  28: 120000, 29: 135000, 30: 155000,
};

function decodeEntities(value) {
  const named = {
    nbsp: " ", amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", ensp: " ", emsp: " ",
    ndash: "–", mdash: "—", hellip: "…", middot: "·", bull: "•", times: "×", plusmn: "±",
  };
  return value
    .replace(/&([a-z]+);/gi, (whole, name) => named[name.toLowerCase()] ?? whole)
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)));
}

function plainLines(html) {
  const body = html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? html;
  const plain = decodeEntities(body)
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<!\[[\s\S]*?\]>/g, "")
    .replace(/<script\b[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[\s\S]*?<\/style>/gi, "")
    .replace(/<br\s*\/?\s*>|<\/p\s*>|<\/tr\s*>|<\/h[1-6]\s*>|<\/li\s*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/[\u00a0\u3000]/g, " ");
  const lines = plain.split(/\r?\n/)
    .map((line) => line.replace(/[\t ]+/g, " ").trim())
    .filter(Boolean);

  const stitched = [];
  for (let index = 0; index < lines.length; index += 1) {
    let line = lines[index];
    const opening = (line.match(/[（(]/g) ?? []).length;
    const closing = (line.match(/[）)]/g) ?? []).length;
    if (opening > closing && lines[index + 1]) line = `${line} ${lines[++index]}`;
    stitched.push(line.replace(/\s+([，。；：）])/g, "$1").replace(/([（])\s+/g, "$1"));
  }
  return stitched;
}

async function filesUnder(directory) {
  const output = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) output.push(...await filesUnder(absolute));
    else if (/\.html?$/i.test(entry.name)) output.push(absolute);
  }
  return output;
}

function slugify(value) {
  return value.normalize("NFKD").toLowerCase().replace(/[’']/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function splitLocalizedName(value) {
  const normalized = value.replace(/\s+/g, " ").trim().replace(/[。.]$/, "");
  for (const match of normalized.matchAll(/[A-Za-z]/g)) {
    const index = match.index ?? 0;
    const left = normalized.slice(0, index).trim();
    const right = normalized.slice(index).trim();
    const rightWithoutUsage = right.replace(/\s*[（(][^）)]*[）)]\s*$/, "").trim();
    if (/[㐀-鿿]/.test(left) && !/[㐀-鿿]/.test(rightWithoutUsage) && /[A-Za-z]{2}/.test(rightWithoutUsage)) {
      return { name: left, name_en: right.replace(/\s+/g, " ") };
    }
  }
  const reverse = normalized.match(/^([A-Za-z][A-Za-z0-9'’&(),/ .-]+?)\s*([㐀-鿿][\s\S]*)$/);
  if (reverse) return { name: reverse[2].trim(), name_en: reverse[1].trim() };
  return { name: normalized };
}

function parseKind(value) {
  const normalized = value.replace(/\s+/g, "").replace(/,/g, "，");
  const comma = normalized.lastIndexOf("，");
  const kind = comma >= 0 ? normalized.slice(0, comma) : normalized;
  const alignment = comma >= 0 ? normalized.slice(comma + 1) : "未注明";
  const sizeMatch = kind.match(/^(微型|小型|中型|大型|巨型|超巨型)(.*)$/);
  if (!sizeMatch) return null;
  const remainder = sizeMatch[2] || "生物";
  const subtype = remainder.match(/^(.+?)[（(]([^）)]+)[）)]$/);
  return {
    size: sizeMatch[1],
    type: (subtype?.[1] ?? remainder).trim(),
    subtype: subtype?.[2]?.trim() || undefined,
    alignment: alignment || "未注明",
  };
}

function parseFraction(value) {
  const normalized = value.replace(/\s+/g, "");
  const fraction = normalized.match(/^(\d+)\/(\d+)$/);
  return fraction ? Number(fraction[1]) / Number(fraction[2]) : Number(normalized);
}

function proficiencyBonus(cr) {
  return cr < 5 ? 2 : 2 + Math.floor((cr - 1) / 4);
}

function splitList(value) {
  if (!value || /^(—|－|-|无|なし)$/i.test(value.trim())) return [];
  return value.split(/[，,；;]/).map((item) => item.trim()).filter(Boolean);
}

function parseSpeed(value) {
  const speed = {};
  for (const part of value.split(/[，,；;]/).map((item) => item.trim()).filter(Boolean)) {
    const match = part.match(/^(掘穴|攀爬|飞行|游泳|步行)?\s*(.+)$/);
    if (!match) continue;
    speed[match[1] || "步行"] = match[2].replace(/\s+/g, "");
  }
  return speed;
}

function fieldValue(lines, labels) {
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    for (const label of labels) {
      const match = line.match(new RegExp(`^${label}\\s*[：:]?\\s*(.*)$`, "i"));
      if (!match) continue;
      let value = match[1].trim();
      const next = lines[index + 1] ?? "";
      const opens = (value.match(/[（(]/g) ?? []).length;
      const closes = (value.match(/[）)]/g) ?? []).length;
      const numericContinuation = ["护甲等级", "生命值", "速度", "感官", "挑战等级", "挑战级别", "CR"].includes(label)
        && /^(?:[（(]?\s*[+\-\d]|尺|XP)/i.test(next);
      if ((!value || opens > closes || numericContinuation) && next && !/^(?:护甲等级|生命值|速度|豁免|技能|装备|伤害易伤|易伤|伤害抗性|抗性|伤害免疫|状态免疫|感官|语言|挑战等级|挑战级别|CR)\s*[：:]?/i.test(next)) {
        value = `${value} ${next}`.trim();
      }
      return value;
    }
  }
  return "";
}

function parseFeatureStart(value) {
  const punctuation = value.indexOf("。");
  if (punctuation < 1 || punctuation > 140) return null;
  const heading = value.slice(0, punctuation).trim().replace(/[。.]$/, "");
  const desc = value.slice(punctuation + 1).trim();
  if (!heading || !desc) return null;
  const localized = splitLocalizedName(heading);
  const validEnglishHeading = localized.name_en && /^[A-Z]/.test(localized.name_en);
  const chineseOnlyHeading = !validEnglishHeading
    && heading.length <= 16
    && /^[㐀-鿿]/.test(heading)
    && !/[A-Za-z]/.test(heading)
    && !/[，,；;：:！？!?]/.test(heading)
    && !/^(?:DC\s*)?\d/i.test(heading)
    && !/(?:豁免|检定|伤害|目标|生物).*(?:失败|成功|则|将)/.test(heading);
  if (!validEnglishHeading && !chineseOnlyHeading) return null;
  return { ...localized, desc };
}

function parseFeatures(lines, fallbackName) {
  const items = [];
  const intro = [];
  const normalizedLines = lines
    .map((line) => line.replace(/^[-•]\s*/, "").trim())
    .filter(Boolean)
    .flatMap((line) => line
      .replace(/。(?=[㐀-鿿][^。]{0,100}[A-Z])/g, "。\u0000")
      .split("\u0000")
      .map((part) => part.trim())
      .filter(Boolean));

  for (let index = 0; index < normalizedLines.length; index += 1) {
    const line = normalizedLines[index];
    if (/^(?:\d+(?:\s*\/\s*\d+)?\s*)?[（(]?\s*[\d,]+\s*XP\s*[）)]?$/i.test(line)) continue;

    let parsed = null;
    let consumed = 1;
    for (let width = 1; width <= 3 && index + width <= normalizedLines.length; width += 1) {
      const candidate = normalizedLines.slice(index, index + width).join(" ")
        .replace(/\s+。/g, "。")
        .replace(/。\s+/g, "。");
      const feature = parseFeatureStart(candidate);
      if (feature) {
        parsed = feature;
        consumed = width;
        break;
      }
    }

    if (parsed) {
      const feature = parsed;
      const attack = feature.desc.match(/(?:命中[+＋]|[+＋])(\d+)(?:命中)?/);
      if (attack) feature.attack_bonus = Number(attack[1]);
      items.push(feature);
      index += consumed - 1;
      continue;
    }
    if (items.length) items[items.length - 1].desc += `\n${line}`;
    else intro.push(line);
  }
  if (intro.length) items.unshift({ name: fallbackName, desc: intro.join("\n") });
  for (const item of items) {
    item.desc = item.desc
      .replace(/([A-Za-z])\n(?=[A-Za-z])/g, "$1 ")
      .replace(/\bDC\s*\n\s*(\d+)/g, "DC $1")
      .replace(/\n(?=\d+的(?:力量|敏捷|体质|智力|感知|魅力)豁免)/g, " ")
      .replace(/\n(?=\d+[（(]\d+d\d+)/gi, " ");
  }
  return items;
}

function findBlocks(lines) {
  const candidates = [];
  for (let acIndex = 0; acIndex < lines.length; acIndex += 1) {
    if (!/^护甲等级\s*[：:]/.test(lines[acIndex])) continue;
    let kindIndex = -1;
    for (let cursor = acIndex - 1; cursor >= Math.max(0, acIndex - 7); cursor -= 1) {
      if (parseKind(lines[cursor])) {
        kindIndex = cursor;
        break;
      }
    }
    if (kindIndex < 1) continue;
    let nameIndex = kindIndex - 1;
    let localized = splitLocalizedName(lines[nameIndex]);
    if (!localized.name_en && nameIndex > 0) {
      const combined = `${lines[nameIndex - 1]} ${lines[nameIndex]}`;
      const combinedName = splitLocalizedName(combined);
      if (combinedName.name_en) {
        nameIndex -= 1;
        localized = combinedName;
      }
    }
    candidates.push({ acIndex, kindIndex, nameIndex, localized });
  }
  return candidates.map((candidate, index) => ({
    ...candidate,
    endIndex: candidates[index + 1]?.nameIndex ?? lines.length,
    ordinal: index + 1,
  }));
}

function parseBlock(lines, block, relativePath, pageTitle, warnings) {
  const blockLines = lines.slice(block.nameIndex, block.endIndex);
  const kind = parseKind(lines[block.kindIndex]);
  const acText = fieldValue(blockLines, ["护甲等级"]);
  const hpText = fieldValue(blockLines, ["生命值"]);
  const speedText = fieldValue(blockLines, ["速度"]);
  const ac = Number(acText.match(/\d+/)?.[0] ?? 0);
  const hpMatch = hpText.match(/(\d+)\s*[（(]([^）)]+)[）)]/);
  const abilities = {};
  const blockText = blockLines.join(" ");
  for (const [label, key] of Object.entries(ABILITY_NAMES)) {
    const matched = blockText.match(new RegExp(`${label}(?:STR|DEX|CON|INT|WIS|CHA)?\\s*(\\d+)`, "i"));
    abilities[key] = Number(matched?.[1] ?? 0);
  }

  const challengeText = fieldValue(blockLines, ["挑战等级", "挑战级别", "CR"]);
  const crLabel = challengeText.match(/^(\d+(?:\s*\/\s*\d+)?)/)?.[1] ?? "0";
  const cr = parseFraction(crLabel);
  const xp = Number((challengeText.match(/([\d,]+)\s*XP/i)?.[1] ?? "").replaceAll(",", "")) || XP_BY_CR[cr] || 0;

  const fields = {};
  for (const [label, key] of Object.entries(FIELD_LABELS)) {
    if (!fields[key]) fields[key] = fieldValue(blockLines, [label]);
  }

  const challengeIndex = blockLines.findIndex((line) => /^(挑战等级|挑战级别|CR)\s*[：:]?/i.test(line));
  const sectionLines = {};
  let activeSection = "special_abilities";
  for (const line of blockLines.slice(Math.max(0, challengeIndex + 1))) {
    const normalized = line.replace(/[：:]/g, "").replace(/\s+/g, "");
    const section = SECTION_KEYS.get(normalized);
    if (section) {
      activeSection = section;
      sectionLines[activeSection] ??= [];
      continue;
    }
    sectionLines[activeSection] ??= [];
    sectionLines[activeSection].push(line);
  }

  const name = block.localized.name;
  const nameEn = block.localized.name_en;
  const missing = [];
  if (!nameEn) missing.push("英文名");
  if (!kind) missing.push("体型/类型/阵营");
  if (!ac) missing.push("护甲等级");
  if (!hpMatch) missing.push("生命值");
  if (Object.values(abilities).some((value) => !value)) missing.push("六项属性");
  if (!challengeText) missing.push("挑战等级");
  if (missing.length) warnings.push({ source_path: relativePath, block: block.ordinal, name, missing });

  const conditionText = fields.condition_immunities || "";
  const sourceUrl = `https://github.com/DND5eChm/DND5e_chm/blob/${EXPECTED_COMMIT}/${relativePath.split(/[\\/]/).map(encodeURIComponent).join("/")}`;
  const record = {
    index: slugify(nameEn || `${pageTitle}-${block.ordinal}`),
    name,
    name_en: nameEn || undefined,
    url: `/api/monsters/${slugify(nameEn || `${pageTitle}-${block.ordinal}`)}`,
    edition: "2014 / 5E",
    source: "DND5e不全书 · 5E怪物图鉴",
    source_file: relativePath.split(path.sep).join("/"),
    source_url: sourceUrl,
    source_commit: EXPECTED_COMMIT,
    source_license: "GPL-3.0",
    source_block: block.ordinal,
    ...kind,
    armor_class: [{ type: acText.replace(/^\d+\s*/, "").replace(/[（）()]/g, "") || "数值", value: ac }],
    hit_points: Number(hpMatch?.[1] ?? 0),
    hit_dice: hpMatch?.[2]?.replace(/\s+/g, "") ?? "",
    hit_points_roll: hpMatch?.[2]?.replace(/\s+/g, "") ?? "",
    speed: parseSpeed(speedText),
    ...abilities,
    saving_throws: fields.saving_throws || "",
    skills: fields.skills || "",
    gear: fields.gear || "",
    damage_vulnerabilities: splitList(fields.damage_vulnerabilities),
    damage_resistances: splitList(fields.damage_resistances),
    damage_immunities: splitList(fields.damage_immunities),
    condition_immunities: splitList(conditionText).map((item) => ({ index: slugify(item) || item, name: item })),
    senses: { 描述: fields.senses_text || "" },
    senses_text: fields.senses_text || "",
    languages: fields.languages || "—",
    challenge_rating: Number.isFinite(cr) ? cr : 0,
    proficiency_bonus: proficiencyBonus(cr),
    xp,
  };

  for (const [section, featureLines] of Object.entries(sectionLines)) {
    const fallback = section === "legendary_actions" ? "传奇动作规则" : section === "lair_actions" ? "巢穴动作规则" : "说明";
    const features = parseFeatures(featureLines, fallback);
    if (features.length) record[section] = features;
  }
  return record;
}

async function main() {
  const commit = execFileSync("git", ["-C", sourceRepo, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  if (commit !== EXPECTED_COMMIT) throw new Error(`源提交不匹配：预期 ${EXPECTED_COMMIT}，实际 ${commit}`);
  const license = await readFile(path.join(sourceRepo, "LICENSE"), "utf8");
  if (!/GNU GENERAL PUBLIC LICENSE[\s\S]*Version 3/i.test(license)) throw new Error("未检测到仓库 GPL-3.0 许可证");

  const files = await filesUnder(sourceRoot);
  const records = [];
  const warnings = [];
  const pages = [];
  for (const file of files) {
    const html = decoder.decode(await readFile(file));
    const lines = plainLines(html);
    const blocks = findBlocks(lines);
    if (!blocks.length) continue;
    const relativePath = path.relative(sourceRepo, file).split(path.sep).join("/");
    const pageTitle = decodeEntities(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? path.basename(file, path.extname(file))).replace(/<[^>]+>/g, "").trim();
    pages.push({ source_path: relativePath, blocks: blocks.length });
    for (const block of blocks) records.push(parseBlock(lines, block, relativePath, pageTitle, warnings));
  }

  const duplicateIndexes = new Map();
  for (const record of records) {
    const base = record.index || "unnamed";
    const count = (duplicateIndexes.get(base) ?? 0) + 1;
    duplicateIndexes.set(base, count);
    if (count > 1) {
      record.duplicate_of = base;
      record.index = `${base}-${count}`;
      record.url = `/api/monsters/${record.index}`;
    }
  }

  records.sort((left, right) => left.name.localeCompare(right.name, "zh-CN") || left.name_en?.localeCompare(right.name_en ?? "") || 0);
  const audit = {
    generated_at: new Date().toISOString(),
    source_repository: "https://github.com/DND5eChm/DND5e_chm",
    source_commit: EXPECTED_COMMIT,
    source_directory: "怪物图鉴",
    source_encoding: "GBK / GB2312",
    source_license: "GPL-3.0",
    files_scanned: files.length,
    pages_with_statblocks: pages.length,
    records_generated: records.length,
    unique_english_names: new Set(records.map((record) => record.name_en).filter(Boolean)).size,
    duplicate_base_indexes: [...duplicateIndexes].filter(([, count]) => count > 1).map(([index, count]) => ({ index, count })),
    warnings,
    pages,
    records: records.map(({ index, name, name_en, source_file, source_url, source_block }) => ({
      index,
      name,
      name_en,
      source_path: source_file,
      source_url,
      source_block,
    })),
  };

  if (files.length !== EXPECTED_HTML_FILES) throw new Error(`HTML 文件数不匹配：预期 ${EXPECTED_HTML_FILES}，实际 ${files.length}`);
  if (pages.length !== EXPECTED_STATBLOCK_PAGES) throw new Error(`含资料块页面数不匹配：预期 ${EXPECTED_STATBLOCK_PAGES}，实际 ${pages.length}`);
  if (records.length !== EXPECTED_RECORDS) throw new Error(`怪物资料块数不匹配：预期 ${EXPECTED_RECORDS}，实际 ${records.length}`);
  if (audit.unique_english_names !== records.length) throw new Error(`英文名称并非逐条唯一：${audit.unique_english_names}/${records.length}`);
  if (warnings.length) throw new Error(`发现 ${warnings.length} 个必填字段警告：${JSON.stringify(warnings.slice(0, 5))}`);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(records, null, 2)}\n`, "utf8");
  await writeFile(auditPath, `${JSON.stringify(audit, null, 2)}\n`, "utf8");
  console.log(`已从 ${files.length} 个旧式 HTML 中生成 ${records.length} 个 5E 怪物资料卡；警告 ${warnings.length} 项。`);
}

await main();
