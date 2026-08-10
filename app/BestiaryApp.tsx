"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { abilityModifier, armorValue, type MonsterDetail, type MonsterListEntry, type RulesEdition } from "./types";

const FAVORITES_STORAGE = "bestiary-forge/favorites-v3";
const LEGACY_FAVORITES_STORAGE = "bestiary-forge/favorites-v2";
const DATA_SCHEMA_VERSION = "directory-categories-v2";
const EDITIONS = {
  "5e": {
    short: "5E",
    edition: "D&D 2014 / 5E",
    source: "DND5e不全书",
    switchLabel: "2014 · 中文图鉴",
    count: 424,
    license: "GPL-3.0",
  },
  "5r": {
    short: "5R",
    edition: "D&D 2024 / 5R",
    source: "SRD 5.2",
    switchLabel: "2024 · SRD 5.2",
    count: 328,
    license: "CC BY 4.0",
  },
} as const;
const DIRECTORY_ORDER = [
  "不死生物", "亡灵", "元素生物", "元素", "天界生物", "天族", "巨人", "异怪", "怪兽",
  "构装生物", "构装", "植物", "模板生物", "泥怪", "类人生物", "精类", "妖精", "邪魔",
  "野兽", "非玩家角色", "类人", "龙类", "多类型", "附录A", "补译条目",
] as const;
const ABILITY_GROUPS = [
  [["力量", "strength", "STR"], ["智力", "intelligence", "INT"]],
  [["敏捷", "dexterity", "DEX"], ["感知", "wisdom", "WIS"]],
  [["体质", "constitution", "CON"], ["魅力", "charisma", "CHA"]],
] as const;

function speedText(monster: MonsterDetail) {
  return Object.entries(monster.speed)
    .filter(([, value]) => typeof value === "string")
    .map(([key, value]) => `${key === "walk" ? "步行" : key} ${value}`)
    .join("；");
}

function listText(values?: string[]) {
  return values?.length ? values.join("、") : "—";
}

function sensesText(monster: MonsterDetail) {
  if (monster.senses_text) return monster.senses_text;
  return Object.entries(monster.senses)
    .map(([key, value]) => `${key.replaceAll("_", " ")} ${value}`)
    .join(" · ");
}

function armorDetailText(monster: MonsterDetail) {
  const details = monster.armor_class
    .map((entry) => entry.desc || entry.type)
    .filter((value) => value && value !== "数值");
  return [...new Set(details)].join(" · ");
}

function signedValue(value: number | string) {
  const normalized = typeof value === "string"
    ? value.replaceAll("＋", "+").replaceAll("−", "-").replace(/\s+/g, "")
    : String(value);
  const numeric = Number(normalized);
  if (!Number.isFinite(numeric)) return normalized;
  return numeric >= 0 ? `+${numeric}` : String(numeric);
}

function savingThrowValue(
  monster: MonsterDetail,
  label: string,
  key: "strength" | "dexterity" | "constitution" | "intelligence" | "wisdom" | "charisma",
  abbreviation: string,
) {
  const direct = monster.saving_throws?.match(new RegExp(`(?:${label}|${abbreviation})\\s*([+＋−-]\\s*\\d+)`, "i"));
  if (direct) return signedValue(direct[1]);

  const proficiency = monster.proficiencies?.find((item) => {
    const name = item.proficiency.name;
    return /Saving Throw|豁免/i.test(name) && new RegExp(`(?:${label}|${abbreviation})`, "i").test(name);
  });
  return proficiency ? signedValue(proficiency.value) : abilityModifier(monster[key]);
}

function challengeRatingText(value: number) {
  const fractions = new Map([[0.125, "1/8"], [0.25, "1/4"], [0.5, "1/2"]]);
  return fractions.get(value) ?? String(value);
}

const SPELL_FREQUENCY_PATTERN = /^\s*((?:戏法(?:（随意）)?|随意|每项?\s*\d+\s*\/\s*日|\d+\s*\/\s*日|\d+\s*环(?:（[^）]*法术位）)?)\s*[：:])\s*(.*)$/;

function magicPairParts(text: string, enabled: boolean, keyPrefix: string) {
  if (!enabled) return text;
  const pattern = /([㐀-鿿·]{2,18})([A-Za-z][A-Za-z'’]*(?:[ \t]+[A-Za-z][A-Za-z'’]*){0,5})/g;
  const nodes = [];
  let cursor = 0;
  let index = 0;

  for (const match of text.matchAll(pattern)) {
    const start = match.index ?? 0;
    const chinese = match[1];
    const english = match[2];
    if (/^(?:AC|CR|DC|HP|PB|XP)$/i.test(english)) continue;
    let prefixLength = 0;
    for (const trigger of ["施法施展", "施展法术", "施放法术", "施展", "施放"]) {
      const triggerIndex = chinese.lastIndexOf(trigger);
      if (triggerIndex >= 0) prefixLength = Math.max(prefixLength, triggerIndex + trigger.length);
    }
    if (!prefixLength && chinese.startsWith("法术") && chinese.length > 4) prefixLength = 2;
    if (!prefixLength && chinese.startsWith("或") && chinese.length > 2) prefixLength = 1;

    const prefix = chinese.slice(0, prefixLength);
    const term = chinese.slice(prefixLength);
    if (term.length < 2) continue;
    nodes.push(text.slice(cursor, start), prefix);
    nodes.push(<span className="magic-term" key={`${keyPrefix}-${index}`}>{term}{english}</span>);
    cursor = start + match[0].length;
    index += 1;
  }
  if (!nodes.length) return text;
  nodes.push(text.slice(cursor));
  return nodes;
}

function SpellListText({ text }: { text: string }) {
  const note = text.match(/^(.*?)(\s*[（(][^）)]*(?:动作|施展|版本)[^）)]*[）)]\s*)$/);
  if (!note) return <span className="magic-term spell-list">{text}</span>;
  return <><span className="magic-term spell-list">{note[1]}</span>{note[2]}</>;
}

function RichFeatureText({ text, magicContext, keyPrefix }: { text: string; magicContext: boolean; keyPrefix: string }) {
  const normalized = text.replace(/([A-Za-z])\s*\n\s*(?=[A-Za-z])/g, "$1 ");
  return normalized.split("\n").map((line, index) => {
    const spellLine = line.match(SPELL_FREQUENCY_PATTERN);
    return (
      <Fragment key={`${keyPrefix}-line-${index}`}>
        {index ? <br /> : null}
        {spellLine ? <><strong className="spell-frequency">{spellLine[1]}</strong> <SpellListText text={spellLine[2]} /></> : magicPairParts(line, magicContext, `${keyPrefix}-${index}`)}
      </Fragment>
    );
  });
}

function FeatureList({ title, titleEn, items }: { title: string; titleEn: string; items?: MonsterDetail["actions"] }) {
  if (!items?.length) return null;
  return (
    <section className="feature-section">
      <div className="section-rule"><span>{title}<b>{titleEn}</b></span></div>
      <div className="feature-list">
        {items.map((item, index) => {
          const frequencyHeading = item.name.match(SPELL_FREQUENCY_PATTERN);
          const magicContext = /施法|施展|施放|法术|魔法|Spellcasting|Magic|随意|法术位|\d+\s*\/\s*日/i.test(`${item.name} ${item.name_en ?? ""} ${item.desc}`);
          return (
            <article className={`feature${frequencyHeading ? " spell-feature" : ""}`} key={`${item.name}-${index}`}>
              <p className="feature-copy">
                {frequencyHeading ? (
                  <><strong className="spell-frequency">{frequencyHeading[1]}</strong>{frequencyHeading[2] ? <> <SpellListText text={frequencyHeading[2]} /></> : null}{item.desc ? <><br /><RichFeatureText text={item.desc} magicContext keyPrefix={`${title}-${index}`} /></> : null}</>
                ) : (
                  <><strong className="feature-title">{item.name}{item.name_en ? <span>{item.name_en}</span> : null}</strong><span className="feature-separator">。</span> <RichFeatureText text={item.desc} magicContext={magicContext} keyPrefix={`${title}-${index}`} /></>
                )}
              </p>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function favoriteKey(monster: Pick<MonsterListEntry, "ruleset" | "index">) {
  return `${monster.ruleset}:${monster.index}`;
}

interface DirectoryNode {
  name: string;
  key: string;
  monsters: MonsterListEntry[];
  children: DirectoryNode[];
  total: number;
}

interface MutableDirectoryNode {
  name: string;
  key: string;
  monsters: MonsterListEntry[];
  children: Map<string, MutableDirectoryNode>;
}

function buildDirectoryTree(monsters: MonsterListEntry[]) {
  const root: MutableDirectoryNode = { name: "", key: "", monsters: [], children: new Map() };
  for (const monster of monsters) {
    const path = monster.catalog_path?.length ? monster.catalog_path : [monster.catalog_category || "未分类"];
    let current = root;
    for (const part of path) {
      const key = current.key ? `${current.key}/${part}` : part;
      if (!current.children.has(part)) current.children.set(part, { name: part, key, monsters: [], children: new Map() });
      current = current.children.get(part)!;
    }
    current.monsters.push(monster);
  }

  const ranks = new Map<string, number>(DIRECTORY_ORDER.map((item, index) => [item, index]));
  function finalize(node: MutableDirectoryNode): DirectoryNode {
    const children = [...node.children.values()]
      .map(finalize)
      .sort((left, right) => (ranks.get(left.name) ?? 999) - (ranks.get(right.name) ?? 999) || left.name.localeCompare(right.name, "zh-CN"));
    return {
      name: node.name,
      key: node.key,
      monsters: node.monsters,
      children,
      total: node.monsters.length + children.reduce((sum, child) => sum + child.total, 0),
    };
  }
  return [...root.children.values()].map(finalize)
    .sort((left, right) => (ranks.get(left.name) ?? 999) - (ranks.get(right.name) ?? 999) || left.name.localeCompare(right.name, "zh-CN"));
}

function directoryKeys(nodes: DirectoryNode[]): string[] {
  return nodes.flatMap((node) => [node.key, ...directoryKeys(node.children)]);
}

function MonsterCatalogRow({
  monster, number, active, favorite, onOpen, onToggleFavorite,
}: {
  monster: MonsterListEntry;
  number: number;
  active: boolean;
  favorite: boolean;
  onOpen: (monster: MonsterListEntry) => void;
  onToggleFavorite: (monster: MonsterListEntry) => void;
}) {
  return (
    <div className={`monster-row${active ? " active" : ""}`} role="listitem">
      <button className="monster-name-button" type="button" onClick={() => onOpen(monster)}>
        <span className="catalog-number">{String(number).padStart(3, "0")}</span>
        <span className="catalog-monster-copy"><strong>{monster.name}</strong>{monster.name_en ? <small>{monster.name_en}</small> : null}</span>
      </button>
      <button
        className={`favorite-button${favorite ? " favorite" : ""}`}
        type="button"
        aria-label={favorite ? `取消收藏 ${monster.name}` : `收藏 ${monster.name}`}
        aria-pressed={favorite}
        title={favorite ? "取消收藏" : "加入收藏"}
        onClick={() => onToggleFavorite(monster)}
      >
        <span aria-hidden="true">{favorite ? "★" : "☆"}</span>
      </button>
    </div>
  );
}

function DirectoryBranch({
  node, depth, expanded, forceOpen, activeKey, favoriteIndexes, visibleNumbers, onToggleDirectory, onOpenMonster, onToggleFavorite,
}: {
  node: DirectoryNode;
  depth: number;
  expanded: Set<string>;
  forceOpen: boolean;
  activeKey: string | null;
  favoriteIndexes: Set<string>;
  visibleNumbers: Map<string, number>;
  onToggleDirectory: (key: string) => void;
  onOpenMonster: (monster: MonsterListEntry) => void;
  onToggleFavorite: (monster: MonsterListEntry) => void;
}) {
  const open = forceOpen || expanded.has(node.key);
  return (
    <section className={`directory-node${open ? " open" : ""}${depth === 0 ? " directory-category" : ""}`}>
      <button className="directory-row" type="button" aria-expanded={open} onClick={() => onToggleDirectory(node.key)}>
        <span className="directory-caret" aria-hidden="true">›</span>
        <span className="directory-folder" aria-hidden="true" />
        <strong>{node.name}{depth === 0 ? <em>分类</em> : null}</strong>
        <small>{node.total}</small>
      </button>
      {open ? (
        <div className="directory-children" role="group">
          {node.children.map((child) => (
            <DirectoryBranch
              node={child}
              depth={depth + 1}
              expanded={expanded}
              forceOpen={forceOpen}
              activeKey={activeKey}
              favoriteIndexes={favoriteIndexes}
              visibleNumbers={visibleNumbers}
              onToggleDirectory={onToggleDirectory}
              onOpenMonster={onOpenMonster}
              onToggleFavorite={onToggleFavorite}
              key={child.key}
            />
          ))}
          {node.monsters.map((monster) => {
            const key = favoriteKey(monster);
            return (
              <MonsterCatalogRow
                monster={monster}
                number={visibleNumbers.get(key) ?? 0}
                active={activeKey === key}
                favorite={favoriteIndexes.has(key)}
                onOpen={onOpenMonster}
                onToggleFavorite={onToggleFavorite}
                key={key}
              />
            );
          })}
        </div>
      ) : null}
    </section>
  );
}

function MonsterSheet({ monster }: { monster: MonsterDetail }) {
  const proficiencies = monster.proficiencies
    ?.filter((item) => !/Saving Throw|豁免/i.test(item.proficiency.name))
    .map((item) => `${item.proficiency.name.replace("Skill: ", "")} ${signedValue(item.value)}`)
    .join("；");
  const edition = EDITIONS[monster.ruleset];
  const armorDetail = armorDetailText(monster);
  const conditionImmunities = monster.condition_immunities?.map((item) => item.name).join("、");

  return (
    <article className="monster-sheet">
      <header className="sheet-heading">
        <p className="sheet-edition">{edition.edition} · {edition.source}</p>
        <h2>{monster.name}{monster.name_en ? <span>{monster.name_en}</span> : null}</h2>
        <p className="monster-kind">{monster.size}{monster.type}{monster.subtype ? `（${monster.subtype}）` : ""}，{monster.alignment}</p>
      </header>

      <section className="primary-stats" aria-label="核心数值">
        <div className="primary-stat-pair">
          <p><strong>AC</strong> {armorValue(monster)}{armorDetail ? <span>（{armorDetail}）</span> : null}</p>
          {monster.initiative ? <p><strong>先攻</strong> {monster.initiative}</p> : null}
        </div>
        <p><strong>HP</strong> {monster.hit_points}{monster.hit_dice ? <span>（{monster.hit_dice}）</span> : null}</p>
        <p><strong>速度</strong> {speedText(monster) || "—"}</p>
      </section>

      <div className="ability-table" aria-label="六项属性、调整值与豁免值">
        {ABILITY_GROUPS.map((group, groupIndex) => (
          <div className="ability-pair" key={groupIndex}>
            <div className="ability-column-labels" aria-hidden="true"><span /><span /><span>调整</span><span>豁免</span></div>
            {group.map(([label, key, abbreviation], rowIndex) => (
              <div className={`ability-row${rowIndex ? " alternate" : ""}`} key={key}>
                <strong>{label}</strong>
                <span>{monster[key]}</span>
                <span>{abilityModifier(monster[key])}</span>
                <span>{savingThrowValue(monster, label, key, abbreviation)}</span>
              </div>
            ))}
          </div>
        ))}
      </div>

      <dl className="stat-lines">
        {monster.skills ? <div><dt>技能</dt><dd>{monster.skills}</dd></div> : null}
        {monster.damage_vulnerabilities?.length ? <div><dt>易伤</dt><dd>{listText(monster.damage_vulnerabilities)}</dd></div> : null}
        {monster.damage_resistances?.length ? <div><dt>抗性</dt><dd>{listText(monster.damage_resistances)}</dd></div> : null}
        {monster.damage_immunities?.length ? <div><dt>伤害免疫</dt><dd>{listText(monster.damage_immunities)}</dd></div> : null}
        {conditionImmunities ? <div><dt>状态免疫</dt><dd>{conditionImmunities}</dd></div> : null}
        <div><dt>感官</dt><dd>{sensesText(monster) || "—"}</dd></div>
        <div><dt>语言</dt><dd>{monster.languages || "—"}</dd></div>
        {monster.gear ? <div><dt>装备</dt><dd>{monster.gear}</dd></div> : null}
        {proficiencies ? <div><dt>熟练项</dt><dd>{proficiencies}</dd></div> : null}
        <div><dt>CR</dt><dd>{challengeRatingText(monster.challenge_rating)}（XP{monster.xp.toLocaleString()}{monster.proficiency_bonus ? `；PB+${monster.proficiency_bonus}` : ""}）</dd></div>
      </dl>

      <FeatureList title="特质" titleEn="Traits" items={monster.special_abilities} />
      <FeatureList title="动作" titleEn="Actions" items={monster.actions} />
      <FeatureList title="附赠动作" titleEn="Bonus Actions" items={monster.bonus_actions} />
      <FeatureList title="反应" titleEn="Reactions" items={monster.reactions} />
      <FeatureList title="传奇动作" titleEn="Legendary Actions" items={monster.legendary_actions} />
      <FeatureList title="巢穴动作" titleEn="Lair Actions" items={monster.lair_actions} />

      <footer className="source-note">
        <strong>{monster.ruleset === "5e" ? "原页可逐条核对" : "开放规则资料"}</strong>
        <span>{monster.ruleset === "5e"
          ? `本资料卡由 DND5e不全书旧式中文 HTML 规范化生成；源提交 ${monster.source_commit?.slice(0, 7) ?? "190ba73"}，仓库标注 GPL-3.0。`
          : "本资料卡来自 SRD 5.2 的非官方中文整理，以 CC BY 4.0 使用。"}</span>
        {monster.source_file ? <span>源文件：{monster.source_file}{monster.source_block ? ` · 第 ${monster.source_block} 个资料块` : ""}</span> : null}
        {monster.source_url ? <a href={monster.source_url} target="_blank" rel="noreferrer">核对这张资料卡的原始 HTML →</a> : null}
        <a href="/sources" target="_blank" rel="noreferrer">查看数据范围、勘误与完整署名 →</a>
      </footer>
    </article>
  );
}

export function BestiaryApp() {
  const [ruleset, setRuleset] = useState<RulesEdition>("5r");
  const [monsters, setMonsters] = useState<MonsterListEntry[]>([]);
  const [query, setQuery] = useState("");
  const [expandedDirectories, setExpandedDirectories] = useState<Set<string>>(() => new Set());
  const [catalogState, setCatalogState] = useState<"loading" | "ready" | "error">("loading");
  const [favorites, setFavorites] = useState<MonsterListEntry[]>([]);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, MonsterDetail>>({});
  const [detailState, setDetailState] = useState<"idle" | "loading" | "error">("idle");
  const [favoritesReady, setFavoritesReady] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/monsters?edition=${ruleset}&schema=${DATA_SCHEMA_VERSION}`, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("catalog");
        return response.json() as Promise<{ results: MonsterListEntry[] }>;
      })
      .then((payload) => {
        setMonsters(payload.results);
        setExpandedDirectories(new Set(buildDirectoryTree(payload.results).map((node) => node.key)));
        setCatalogState("ready");
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) setCatalogState("error");
      });
    return () => controller.abort();
  }, [ruleset]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const stored = window.localStorage.getItem(FAVORITES_STORAGE) ?? window.localStorage.getItem(LEGACY_FAVORITES_STORAGE);
        const parsed = stored ? JSON.parse(stored) as MonsterListEntry[] : [];
        if (Array.isArray(parsed)) {
          const safe = parsed
            .filter((item) => item && typeof item.index === "string" && typeof item.name === "string")
            .map((item) => ({ ...item, catalog_category: item.catalog_category || "其他", catalog_path: item.catalog_path || [], ruleset: item.ruleset === "5e" ? "5e" as const : "5r" as const }));
          setFavorites(safe);
          setActiveKey(safe[0] ? favoriteKey(safe[0]) : null);
        }
      } catch {
        window.localStorage.removeItem(FAVORITES_STORAGE);
      } finally {
        setFavoritesReady(true);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (favoritesReady) window.localStorage.setItem(FAVORITES_STORAGE, JSON.stringify(favorites));
  }, [favorites, favoritesReady]);

  useEffect(() => {
    const selected = favorites.find((favorite) => favoriteKey(favorite) === activeKey);
    if (!selected || !activeKey || details[activeKey]) return;
    const selectedKey = activeKey;
    const controller = new AbortController();
    async function loadDetail() {
      await Promise.resolve();
      if (controller.signal.aborted) return;
      setDetailState("loading");
      try {
        const response = await fetch(`/api/monsters/${encodeURIComponent(selected.index)}?edition=${selected.ruleset}&schema=${DATA_SCHEMA_VERSION}`, { signal: controller.signal, cache: "no-store" });
        if (!response.ok) throw new Error("detail");
        const monster = await response.json() as MonsterDetail;
        setDetails((current) => ({ ...current, [selectedKey]: monster }));
        setDetailState("idle");
      } catch (error: unknown) {
        if (!(error instanceof DOMException && error.name === "AbortError")) setDetailState("error");
      }
    }
    void loadDetail();
    return () => controller.abort();
  }, [activeKey, details, favorites]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 2800);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const favoriteIndexes = useMemo(() => new Set(favorites.map(favoriteKey)), [favorites]);
  const filteredMonsters = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return monsters.filter((monster) => {
      const searchable = `${monster.name} ${monster.name_en ?? ""} ${(monster.catalog_path ?? []).join(" ")}`.toLocaleLowerCase();
      return !normalized || searchable.includes(normalized);
    });
  }, [monsters, query]);
  const directoryTree = useMemo(() => buildDirectoryTree(filteredMonsters), [filteredMonsters]);
  const allDirectoryKeys = useMemo(() => directoryKeys(buildDirectoryTree(monsters)), [monsters]);
  const allDirectoriesExpanded = allDirectoryKeys.length > 0 && allDirectoryKeys.every((key) => expandedDirectories.has(key));
  const visibleNumbers = useMemo(() => new Map(filteredMonsters.map((monster, index) => [favoriteKey(monster), index + 1])), [filteredMonsters]);
  const activeFavorite = activeKey ? favorites.find((favorite) => favoriteKey(favorite) === activeKey) : undefined;
  const activeMonster = activeKey ? details[activeKey] : undefined;

  function addFavorite(monster: MonsterListEntry) {
    const key = favoriteKey(monster);
    setFavorites((current) => current.some((item) => favoriteKey(item) === key) ? current : [...current, monster]);
    setActiveKey(key);
    setNotice(`已收藏 ${monster.name}（${EDITIONS[monster.ruleset].short}）`);
  }

  function changeRuleset(nextRuleset: RulesEdition) {
    if (nextRuleset === ruleset) return;
    setCatalogState("loading");
    setMonsters([]);
    setExpandedDirectories(new Set());
    setRuleset(nextRuleset);
  }

  function toggleDirectory(key: string) {
    if (query.trim()) return;
    setExpandedDirectories((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleAllDirectories() {
    setExpandedDirectories(allDirectoriesExpanded ? new Set() : new Set(allDirectoryKeys));
  }

  function removeFavorite(key: string) {
    setFavorites((current) => {
      const position = current.findIndex((item) => favoriteKey(item) === key);
      const next = current.filter((item) => favoriteKey(item) !== key);
      if (activeKey === key) {
        const replacement = next[Math.min(position, next.length - 1)];
        setActiveKey(replacement ? favoriteKey(replacement) : null);
      }
      return next;
    });
    setNotice("已从收藏中移除");
  }

  function toggleFavorite(monster: MonsterListEntry) {
    const key = favoriteKey(monster);
    if (favoriteIndexes.has(key)) removeFavorite(key);
    else addFavorite(monster);
  }

  function openMonster(monster: MonsterListEntry) {
    const key = favoriteKey(monster);
    if (favoriteIndexes.has(key)) {
      setActiveKey(key);
      setNotice("");
    } else {
      setNotice(`点击 ${monster.name} 右侧的星标，将它加入资料卡`);
    }
  }

  return (
    <main className="bestiary-app">
      <header className="app-header">
        <div className="brand-mark" aria-hidden="true">BF</div>
        <div className="brand-copy">
          <h1>Bestiary Forge <span className="brand-context">怪物目录</span></h1>
          <p>D&amp;D 2014 / 5E + 2024 / 5R 中文怪物图鉴</p>
        </div>
        <a className="source-link" href="/sources" target="_blank" rel="noreferrer">来源与许可</a>
        <div className="header-badge"><span>★</span>{favorites.length} 个收藏</div>
      </header>

      <div className="bestiary-workspace">
        <aside className="catalog-panel" aria-label="怪物目录">
          <div className="catalog-heading">
            <p className="eyebrow">{EDITIONS[ruleset].source} · ZH-CN</p>
            <div className="catalog-heading-actions">
              <span className="catalog-count">{filteredMonsters.length} / {monsters.length}</span>
              <button
                className="catalog-expand-button"
                type="button"
                onClick={toggleAllDirectories}
                disabled={!allDirectoryKeys.length || Boolean(query.trim())}
              >
                {allDirectoriesExpanded ? "全部收起" : "全部展开"}
              </button>
            </div>
          </div>

          <div className="edition-switch" role="group" aria-label="切换怪物图鉴规则版本">
            {(Object.keys(EDITIONS) as RulesEdition[]).map((editionKey) => (
              <button
                type="button"
                className={ruleset === editionKey ? "active" : ""}
                aria-pressed={ruleset === editionKey}
                onClick={() => changeRuleset(editionKey)}
                key={editionKey}
              >
                <strong>{EDITIONS[editionKey].short}</strong>
                <span>{EDITIONS[editionKey].switchLabel}</span>
              </button>
            ))}
          </div>

          <label className="search-box">
            <span aria-hidden="true">⌕</span>
            <span className="sr-only">搜索怪物</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索中文或英文名称…" />
            {query ? <button type="button" aria-label="清除搜索" onClick={() => setQuery("")}>×</button> : null}
          </label>

          <div className="directory-toolbar">
            <span><i aria-hidden="true" />目录分类 <b>{directoryTree.length} 类</b></span>
          </div>

          <p className="catalog-tip">怪物已按原图鉴目录分类。一级分类默认展开；5R 的分类内可继续展开原有子目录。</p>

          <div className="monster-list" role="list" aria-label={`${EDITIONS[ruleset].short} 怪物目录树`}>
            {catalogState === "loading" ? <div className="catalog-message"><span className="spinner" />正在翻阅图鉴…</div> : null}
            {catalogState === "error" ? <div className="catalog-message error">本地中文数据库加载失败，请刷新重试。</div> : null}
            {catalogState === "ready" && !filteredMonsters.length ? <div className="catalog-message">没有找到匹配的怪物。</div> : null}
            {directoryTree.map((node) => (
              <DirectoryBranch
                node={node}
                depth={0}
                expanded={expandedDirectories}
                forceOpen={Boolean(query.trim())}
                activeKey={activeKey}
                favoriteIndexes={favoriteIndexes}
                visibleNumbers={visibleNumbers}
                onToggleDirectory={toggleDirectory}
                onOpenMonster={openMonster}
                onToggleFavorite={toggleFavorite}
                key={node.key}
              />
            ))}
          </div>
        </aside>

        <section className="card-browser" aria-label="收藏怪物资料卡">
          <div className="browser-chrome">
            <div className="window-dots" aria-hidden="true"><i /><i /><i /></div>
            <nav className="tab-strip" aria-label="收藏资料卡导航">
              {favorites.map((favorite) => (
                <div className={`browser-tab${activeKey === favoriteKey(favorite) ? " active" : ""}`} key={favoriteKey(favorite)}>
                  <button className="tab-select" type="button" onClick={() => setActiveKey(favoriteKey(favorite))}>
                    <span aria-hidden="true">★</span>
                    <small>{EDITIONS[favorite.ruleset].short}</small>
                    <span>{favorite.name}</span>
                  </button>
                  <button className="tab-close" type="button" onClick={() => removeFavorite(favoriteKey(favorite))} aria-label={`关闭 ${favorite.name} 资料卡`}>×</button>
                </div>
              ))}
              {!favorites.length ? <span className="empty-tab-label">收藏标签页</span> : null}
            </nav>
            <span className="local-label" title="收藏仅保存在当前浏览器">本机</span>
          </div>

          <div className="browser-toolbar">
            <button type="button" disabled aria-label="后退">‹</button>
            <button type="button" disabled aria-label="前进">›</button>
            <div className="address-bar"><span aria-hidden="true">✦</span>{activeFavorite ? `bestiary.local/${activeFavorite.ruleset}/monster/${activeFavorite.index}` : "bestiary.local/favorites"}</div>
          </div>

          <div className="card-viewport">
            {!favorites.length ? (
              <div className="empty-state">
                <div className="empty-emblem" aria-hidden="true">☆</div>
                <p className="eyebrow">Your field notes</p>
                <h2>这里还没有收藏</h2>
                <p>从左侧怪物目录点击星标，怪物资料卡会像浏览器标签页一样依次打开在这里。</p>
                <span>424 张 5E 中文图鉴 + 328 张 5R 中文 SRD 资料卡均已内置 · 收藏保存在当前设备</span>
              </div>
            ) : null}
            {favorites.length && detailState === "loading" ? <div className="sheet-message"><span className="spinner" />正在展开资料卡…</div> : null}
            {favorites.length && detailState === "error" ? <div className="sheet-message error">资料卡加载失败，请切换标签页后重试。</div> : null}
            {activeMonster ? <MonsterSheet monster={activeMonster} /> : null}
          </div>
        </section>
      </div>

      <div className={`toast${notice ? " visible" : ""}`} role="status" aria-live="polite">{notice}</div>
    </main>
  );
}
