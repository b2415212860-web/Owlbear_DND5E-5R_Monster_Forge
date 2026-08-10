import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const workspace = process.cwd();
const chineseRoot = path.resolve(process.argv[2] ?? path.join(workspace, "work", "srd52-chinese-source"));
const foundryRoot = path.resolve(process.argv[3] ?? path.join(workspace, "work", "foundry-dnd5e-source"));
const outputPath = path.join(workspace, "data", "srd52-monsters.zh-CN.json");
const decoder = new TextDecoder("gbk");

const NAME_ALIASES = new Map([
  ["Owlbears", "Owlbear"],
  ["Swarm of Crawling Claw", "Swarm of Crawling Claws"],
  ["Will-o’-Wisp", "Will-o'-Wisp"],
]);

const EXCLUDED_NON_SRD = new Set(["Giant Squid", "Giant Centipede", "Giant Wasp"]);

const SOURCE_CATEGORY_MAP = new Map([
  ["亡灵", "不死生物"],
  ["元素", "元素生物"],
  ["天族", "天界生物"],
  ["巨人", "巨人"],
  ["异怪", "异怪"],
  ["怪兽", "怪兽"],
  ["构装", "构装生物"],
  ["植物", "植物"],
  ["泥怪", "泥怪"],
  ["妖精", "精类"],
  ["邪魔", "邪魔"],
  ["龙类", "龙类"],
  ["类人", "非玩家角色"],
]);

function categoryFromType(type) {
  if (type.includes("亡灵")) return "不死生物";
  if (type.includes("元素")) return "元素生物";
  if (type.includes("天族")) return "天界生物";
  if (type.includes("巨人")) return "巨人";
  if (type.includes("异怪")) return "异怪";
  if (type.includes("怪兽")) return "怪兽";
  if (type.includes("构装")) return "构装生物";
  if (type.includes("植物")) return "植物";
  if (type.includes("泥怪")) return "泥怪";
  if (type.includes("类人")) return "类人生物";
  if (type.includes("妖精")) return "精类";
  if (type.includes("邪魔")) return "邪魔";
  if (type.includes("野兽")) return "野兽";
  if (type.includes("龙")) return "龙类";
  return "其他";
}

function catalogCategory(monster) {
  if (monster.name_en === "Knight") return "非玩家角色";
  const parts = monster.source_file.split("/");
  const sourceRoot = parts[0] === "怪物图鉴2025" ? parts[1] : "";
  return SOURCE_CATEGORY_MAP.get(sourceRoot) ?? categoryFromType(monster.type);
}

function catalogPath(monster) {
  const parts = monster.source_file.split("/");
  if (parts[0] === "怪物图鉴2025") return parts.slice(1, -1);
  return ["补译条目"];
}

const SECTION_KEYS = [
  ["传奇动作", "legendary_actions"],
  ["附赠动作", "bonus_actions"],
  ["奖励动作", "bonus_actions"],
  ["反应", "reactions"],
  ["特质", "special_abilities"],
  ["动作", "actions"],
];

const ABILITY_NAMES = {
  力量: "strength",
  敏捷: "dexterity",
  体质: "constitution",
  智力: "intelligence",
  感知: "wisdom",
  魅力: "charisma",
};

function decodeEntities(value) {
  return value
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)));
}

function plainText(value) {
  return decodeEntities(value)
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<\/p\s*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/[\t\r ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function slugify(value) {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function filesUnder(directory, suffix = "") {
  const output = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) output.push(...await filesUnder(absolute, suffix));
    else if (!suffix || entry.name.toLowerCase().endsWith(suffix)) output.push(absolute);
  }
  return output;
}

function splitLocalizedName(value) {
  const normalized = plainText(value).replace(/\s+/g, " ").trim();
  const match = normalized.match(/^(.+?)([A-Za-z][\s\S]*)$/);
  if (!match) throw new Error(`无法拆分中英文名称：${normalized}`);
  const name = match[1].trim();
  const nameEn = (NAME_ALIASES.get(match[2].trim()) ?? match[2].trim()).replace(/\s+/g, " ");
  return { name, nameEn };
}

function extract(html, pattern, label) {
  const match = html.match(pattern);
  if (!match) throw new Error(`缺少字段 ${label}`);
  return plainText(match[1]);
}

function parseKind(value) {
  const [kind = "", alignment = ""] = value.split("，", 2).map((part) => part.trim());
  const sizeMatch = kind.match(/^(微型|小型|中型|大型|巨型|超巨型)(.*)$/);
  if (!sizeMatch) throw new Error(`无法解析体型：${value}`);
  const rest = sizeMatch[2].trim();
  const subtypeMatch = rest.match(/^([^（(]+)[（(]([^）)]+)[）)]$/);
  return {
    size: sizeMatch[1],
    type: (subtypeMatch?.[1] ?? rest).trim(),
    subtype: subtypeMatch?.[2]?.trim() || undefined,
    alignment,
  };
}

function parseSpeed(value) {
  const speed = {};
  for (const part of value.split(/[，,]/).map((item) => item.trim()).filter(Boolean)) {
    const matched = part.match(/^(掘穴|攀爬|飞行|游泳|步行)?\s*(.+)$/);
    if (!matched) continue;
    const key = matched[1] || "步行";
    speed[key] = matched[2].replace(/\s+/g, "");
  }
  return speed;
}

function splitList(value) {
  if (!value || /^(无|—|-)$/.test(value.trim())) return [];
  return value.split(/[，,、]/).map((item) => item.trim()).filter(Boolean);
}

function fieldMap(html) {
  const fields = {};
  const pattern = /<strong>\s*(技能|豁免|易伤|抗性|免疫|感官|语言|装备|CR)\s*<\/strong>([\s\S]*?)<\/td>/gi;
  for (const match of html.matchAll(pattern)) fields[match[1]] = plainText(match[2]);
  return fields;
}

function splitFeatureName(rawName) {
  const cleaned = plainText(rawName).replace(/[。.]$/, "").trim();
  const match = cleaned.match(/^(.+?)([A-Za-z][\s\S]*)$/);
  return match
    ? { name: match[1].trim(), name_en: match[2].trim() }
    : { name: cleaned };
}

function parseFeatures(html) {
  const sections = {};
  const sectionPattern = /<h6>([\s\S]*?)<\/h6>([\s\S]*?)(?=<h6>|<\/div>)/gi;
  for (const section of html.matchAll(sectionPattern)) {
    const heading = plainText(section[1]);
    const destination = SECTION_KEYS.find(([label]) => heading.includes(label))?.[1];
    if (!destination) continue;

    const body = section[2];
    const tokens = [...body.matchAll(/<strong>([\s\S]*?)<\/strong>/gi)];
    const items = [];
    const intro = plainText(body.slice(0, tokens[0]?.index ?? body.length));
    if (intro) items.push({ name: destination === "legendary_actions" ? "传奇动作规则" : "说明", desc: intro });

    for (let index = 0; index < tokens.length; index += 1) {
      const token = tokens[index];
      const nextIndex = tokens[index + 1]?.index ?? body.length;
      const rawName = plainText(token[1]);
      const description = plainText(body.slice((token.index ?? 0) + token[0].length, nextIndex));
      const isSpellSubheading = /^(随意|[0-9]+\s*\/\s*日)/.test(rawName);
      if (isSpellSubheading && items.length) {
        items[items.length - 1].desc = `${items[items.length - 1].desc}\n${rawName}${description}`.trim();
        continue;
      }
      const item = { ...splitFeatureName(rawName), desc: description };
      if (item.name || item.name_en) items.push(item);
    }
    if (items.length) sections[destination] = [...(sections[destination] ?? []), ...items];
  }
  return sections;
}

function parseAbilityTable(html) {
  const scores = {};
  const saves = [];
  for (const [label, key] of Object.entries(ABILITY_NAMES)) {
    const match = html.match(new RegExp(`<strong>${label}<\\/strong><\\/td>\\s*<td[^>]*>(\\d+)<\\/td>\\s*<td[^>]*>([+\\-]\\d+)<\\/td>\\s*<td[^>]*>([+\\-]\\d+)<\\/td>`, "i"));
    if (!match) throw new Error(`缺少属性 ${label}`);
    scores[key] = Number(match[1]);
    if (match[2] !== match[3]) saves.push(`${label}${match[3]}`);
  }
  return { scores, saves };
}

function parseChallenge(value) {
  const ratingText = value.match(/^(\d+(?:\/\d+)?)/)?.[1];
  if (!ratingText) throw new Error(`无法解析 CR：${value}`);
  const rating = ratingText.includes("/")
    ? Number(ratingText.split("/")[0]) / Number(ratingText.split("/")[1])
    : Number(ratingText);
  const xp = Number((value.match(/XP\s*([\d,]+)/i)?.[1] ?? "0").replaceAll(",", ""));
  const proficiencyBonus = Number(value.match(/PB\s*\+?(\d+)/i)?.[1] ?? 0);
  return { rating, xp, proficiencyBonus };
}

function parseMonster(html, sourceFile) {
  const { name, nameEn } = splitLocalizedName(extract(html, /<h5>([\s\S]*?)<\/h5>/i, "名称"));
  const kind = parseKind(extract(html, /<div class="sub-line">([\s\S]*?)<\/div>/i, "类型"));
  const ac = Number(extract(html, /<strong>\s*AC\s*<\/strong>\s*(\d+)/i, "AC"));
  const initiative = extract(html, /<strong>\s*先攻\s*<\/strong>\s*([^<]+)/i, "先攻");
  const hpMatch = html.match(/<strong>\s*HP\s*<\/strong>\s*(\d+)\s*[（(]([^）)]+)[）)]/i);
  if (!hpMatch) throw new Error("缺少 HP");
  const speedRaw = extract(html, /<strong>\s*速度\s*<\/strong>\s*([\s\S]*?)<\/td>/i, "速度");
  const fields = fieldMap(html);
  const { scores, saves } = parseAbilityTable(html);
  const challenge = parseChallenge(fields.CR ?? "");
  const immunityParts = (fields.免疫 ?? "").split("；");
  const sourceRelative = path.relative(chineseRoot, sourceFile).split(path.sep).join("/");

  return {
    index: slugify(nameEn),
    name,
    name_en: nameEn,
    url: `/api/monsters/${slugify(nameEn)}`,
    edition: "2024 / 5R",
    source: "SRD 5.2",
    source_file: sourceRelative,
    ...kind,
    armor_class: [{ type: "数值", value: ac }],
    initiative,
    hit_points: Number(hpMatch[1]),
    hit_dice: hpMatch[2].replace(/\s+/g, ""),
    hit_points_roll: hpMatch[2].replace(/\s+/g, ""),
    speed: parseSpeed(speedRaw),
    ...scores,
    saving_throws: saves.join("，"),
    skills: fields.技能 ?? "",
    gear: fields.装备 ?? "",
    damage_vulnerabilities: splitList(fields.易伤),
    damage_resistances: splitList(fields.抗性),
    damage_immunities: splitList(immunityParts[0]),
    condition_immunities: splitList(immunityParts.slice(1).join("，")).map((item) => ({ index: slugify(item) || item, name: item })),
    senses: { 描述: fields.感官 ?? "" },
    senses_text: fields.感官 ?? "",
    languages: fields.语言 ?? "无",
    challenge_rating: challenge.rating,
    proficiency_bonus: challenge.proficiencyBonus,
    xp: challenge.xp,
    ...parseFeatures(html),
  };
}

function manualEntries() {
  const shared = {
    edition: "2024 / 5R",
    source: "SRD 5.2",
    armor_class: [],
    saving_throws: "",
    skills: "",
    gear: "",
    damage_vulnerabilities: [],
    damage_resistances: [],
    damage_immunities: [],
    condition_immunities: [],
  };
  return [
    {
      ...shared,
      index: "darkmantle", name: "暗幕魔", name_en: "Darkmantle", url: "/api/monsters/darkmantle",
      source_file: "补译：SRD 5.2 Darkmantle", size: "小型", type: "异怪", alignment: "无阵营",
      armor_class: [{ type: "数值", value: 11 }], initiative: "+3（13）", hit_points: 22, hit_dice: "5d6+5", hit_points_roll: "5d6+5",
      speed: { 步行: "10尺", 飞行: "30尺" }, strength: 16, dexterity: 12, constitution: 13, intelligence: 2, wisdom: 10, charisma: 5,
      skills: "隐匿+3", senses: { 描述: "盲视60尺；被动察觉10" }, senses_text: "盲视60尺；被动察觉10", languages: "无",
      challenge_rating: 0.5, proficiency_bonus: 2, xp: 100,
      actions: [
        { name: "碾压", name_en: "Crush", desc: "近战攻击检定：+5，触及5尺。命中：6（1d6+3）钝击伤害，且暗幕魔附着在目标身上。若目标为中型或更小的生物，且暗幕魔进行该攻击检定时具有优势，它会覆盖目标；以这种方式被覆盖期间，目标陷入目盲状态并会窒息。\n附着期间，暗幕魔只能攻击该目标，但攻击检定具有优势。其速度变为0，无法从速度加值中获益，并随目标一起移动。生物可以执行动作并通过一次DC13力量（运动）检定，使自己身上的暗幕魔脱离。暗幕魔在自己的回合中可消耗5尺移动力自行脱离。" },
        { name: "黑暗光环（1/日）", name_en: "Darkness Aura (1/Day)", desc: "魔法黑暗充满以暗幕魔为源点的15尺发散区域。暗幕魔维持专注期间，该效应持续存在，至多10分钟。黑暗视觉无法看穿该区域，任何光照也无法照亮它。" },
      ],
    },
    {
      ...shared,
      index: "knight", name: "骑士", name_en: "Knight", url: "/api/monsters/knight",
      source_file: "补译：SRD 5.2 Knight", size: "中型或小型", type: "类人生物", alignment: "中立",
      armor_class: [{ type: "板甲", value: 18 }], initiative: "+0（10）", hit_points: 52, hit_dice: "8d8+16", hit_points_roll: "8d8+16",
      speed: { 步行: "30尺" }, strength: 16, dexterity: 11, constitution: 14, intelligence: 11, wisdom: 11, charisma: 15,
      saving_throws: "体质+4，感知+2", gear: "巨剑，重弩，板甲", condition_immunities: [{ index: "frightened", name: "恐慌" }],
      senses: { 描述: "被动察觉10" }, senses_text: "被动察觉10", languages: "通用语及另一种语言",
      challenge_rating: 3, proficiency_bonus: 2, xp: 700,
      actions: [
        { name: "多重攻击", name_en: "Multiattack", desc: "骑士发动两次攻击，可以任意组合使用巨剑或重弩。" },
        { name: "巨剑", name_en: "Greatsword", desc: "近战攻击检定：+5，触及5尺。命中：10（2d6+3）挥砍伤害外加4（1d8）光耀伤害。" },
        { name: "重弩", name_en: "Heavy Crossbow", desc: "远程攻击检定：+2，射程100/400尺。命中：11（2d10）穿刺伤害外加4（1d8）光耀伤害。" },
      ],
      reactions: [{ name: "招架", name_en: "Parry", desc: "触发：骑士持有武器时被一次近战攻击检定命中。响应：骑士针对该次攻击的AC增加2，可能使该攻击转为未命中。" }],
    },
  ];
}

async function foundryActors() {
  const actorsRoot = path.join(foundryRoot, "packs", "_source", "actors24");
  const actors = new Map();
  for (const file of await filesUnder(actorsRoot, ".yml")) {
    if (path.basename(file) === "_folder.yml") continue;
    const source = await readFile(file, "utf8");
    if (!/^[ ]{4}license: CC-BY-4\.0$/m.test(source)) continue;
    const name = source.match(/^name:\s*(.+)$/m)?.[1]?.trim();
    if (name) actors.set(name, { file, source });
  }
  return actors;
}

function foundryNumber(source, pattern) {
  const matched = source.match(pattern)?.[1];
  return matched === undefined ? undefined : Number(matched);
}

function validateMonster(monster, foundry) {
  const actor = foundry.get(monster.name_en);
  if (!actor) throw new Error(`${monster.name_en} 未在 Foundry CC-BY-4.0 actors24 中找到`);
  const errors = [];
  const abilityKeys = { strength: "str", dexterity: "dex", constitution: "con", intelligence: "int", wisdom: "wis", charisma: "cha" };
  for (const [key, short] of Object.entries(abilityKeys)) {
    const expected = foundryNumber(actor.source, new RegExp(`\\r?\\n    ${short}:\\r?\\n      value: (\\d+)`));
    if (expected !== monster[key]) errors.push(`${key} ${monster[key]} != ${expected}`);
  }
  const hp = foundryNumber(actor.source, /\r?\n[ ]{4}hp:\r?\n[ ]{6}value: (\d+)/);
  const cr = foundryNumber(actor.source, /\r?\n[ ]{4}cr: ([\d.]+)/);
  if (hp !== monster.hit_points) errors.push(`hp ${monster.hit_points} != ${hp}`);
  if (cr !== monster.challenge_rating) errors.push(`cr ${monster.challenge_rating} != ${cr}`);
  if (errors.length) throw new Error(`${monster.name} / ${monster.name_en}：${errors.join("；")}`);
}

function canonicalizeNumericFields(monster, foundry) {
  const actor = foundry.get(monster.name_en);
  if (!actor) return monster;
  const corrected = [];
  const abilityKeys = { strength: "str", dexterity: "dex", constitution: "con", intelligence: "int", wisdom: "wis", charisma: "cha" };
  for (const [key, short] of Object.entries(abilityKeys)) {
    const value = foundryNumber(actor.source, new RegExp(`\\r?\\n    ${short}:\\r?\\n      value: (\\d+)`));
    if (value !== undefined && value !== monster[key]) {
      corrected.push(key);
      monster[key] = value;
    }
  }
  const hp = foundryNumber(actor.source, /\r?\n[ ]{4}hp:\r?\n[ ]{6}value: (\d+)/);
  const formula = actor.source.match(/\r?\n[ ]{6}formula: ([^\r\n]+)/)?.[1]?.trim().replaceAll(" ", "");
  const cr = foundryNumber(actor.source, /\r?\n[ ]{4}cr: ([\d.]+)/);
  if (hp !== undefined && hp !== monster.hit_points) {
    corrected.push("hit_points");
    monster.hit_points = hp;
  }
  if (formula && formula !== monster.hit_dice) {
    corrected.push("hit_dice");
    monster.hit_dice = formula;
    monster.hit_points_roll = formula;
  }
  if (cr !== undefined && cr !== monster.challenge_rating) {
    corrected.push("challenge_rating");
    monster.challenge_rating = cr;
  }
  if (corrected.length) monster.corrected_fields = corrected;
  return monster;
}

async function main() {
  const bestiaryRoot = path.join(chineseRoot, "怪物图鉴2025");
  const foundry = await foundryActors();
  const monsters = [];
  const errors = [];
  for (const file of await filesUnder(bestiaryRoot, ".htm")) {
    if (path.basename(file) === "铁魔像2.htm") continue;
    let html = decoder.decode(await readFile(file));
    if (!/<h5>/i.test(html)) continue;
    try {
      if (/<h5>\s*石魔像\s*Stone Golem\s*<\/h5>/i.test(html)) {
        html = html
          .replace(/<strong>AC <\/strong><\/td>/i, "<strong>AC </strong>18</td>")
          .replace(/<strong> HP <\/strong><\/td>/i, "<strong> HP </strong>220（21d10+105）</td>");
      }
      const monster = parseMonster(html, file);
      if (EXCLUDED_NON_SRD.has(monster.name_en)) continue;
      canonicalizeNumericFields(monster, foundry);
      validateMonster(monster, foundry);
      monsters.push(monster);
    } catch (error) {
      errors.push(`${path.relative(chineseRoot, file)}：${error.message}`);
    }
  }

  for (const monster of manualEntries()) {
    try {
      canonicalizeNumericFields(monster, foundry);
      validateMonster(monster, foundry);
      monsters.push(monster);
    } catch (error) {
      errors.push(`手工补译 ${monster.name_en}：${error.message}`);
    }
  }

  if (errors.length) throw new Error(`数据生成失败（${errors.length} 项）：\n${errors.join("\n")}`);
  for (const monster of monsters) {
    monster.catalog_category = catalogCategory(monster);
    monster.catalog_path = catalogPath(monster);
  }
  const uncategorized = monsters.filter((monster) => monster.catalog_category === "其他");
  if (uncategorized.length) throw new Error(`无法分类：${uncategorized.map((monster) => monster.name_en).join(", ")}`);
  monsters.sort((left, right) => left.name.localeCompare(right.name, "zh-CN"));
  const duplicateIndexes = monsters.map((item) => item.index).filter((value, index, all) => all.indexOf(value) !== index);
  if (duplicateIndexes.length) throw new Error(`重复索引：${[...new Set(duplicateIndexes)].join(", ")}`);
  if (monsters.length !== 328) throw new Error(`预期 328 个 SRD 怪物，实际 ${monsters.length} 个`);

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(monsters, null, 2)}\n`, "utf8");
  console.log(`已生成 ${monsters.length} 个 D&D 2024 / 5R SRD 怪物：${path.relative(workspace, outputPath)}`);
}

await main();
