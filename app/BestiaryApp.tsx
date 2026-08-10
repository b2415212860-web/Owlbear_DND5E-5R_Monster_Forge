"use client";

import { useEffect, useMemo, useState } from "react";
import { abilityModifier, armorValue, type MonsterDetail, type MonsterListEntry, type RulesEdition } from "./types";

const FAVORITES_STORAGE = "bestiary-forge/favorites-v3";
const LEGACY_FAVORITES_STORAGE = "bestiary-forge/favorites-v2";
const DATA_SCHEMA_VERSION = "directory-tree-v1";
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
const ABILITIES = [
  ["力量", "strength"],
  ["敏捷", "dexterity"],
  ["体质", "constitution"],
  ["智力", "intelligence"],
  ["感知", "wisdom"],
  ["魅力", "charisma"],
] as const;

function speedText(monster: MonsterDetail) {
  return Object.entries(monster.speed)
    .filter(([, value]) => typeof value === "string")
    .map(([key, value]) => `${key === "walk" ? "步行" : key} ${value}`)
    .join(" · ");
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

function FeatureList({ title, items }: { title: string; items?: MonsterDetail["actions"] }) {
  if (!items?.length) return null;
  return (
    <section className="feature-section">
      <div className="section-rule"><span>{title}</span></div>
      <div className="feature-list">
        {items.map((item, index) => (
          <article className="feature" key={`${item.name}-${index}`}>
            <h4>{item.name}{item.name_en ? <span>{item.name_en}</span> : null}</h4>
            <p>{item.desc}</p>
          </article>
        ))}
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
  node, expanded, forceOpen, activeKey, favoriteIndexes, visibleNumbers, onToggleDirectory, onOpenMonster, onToggleFavorite,
}: {
  node: DirectoryNode;
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
    <section className={`directory-node${open ? " open" : ""}`}>
      <button className="directory-row" type="button" aria-expanded={open} onClick={() => onToggleDirectory(node.key)}>
        <span className="directory-caret" aria-hidden="true">›</span>
        <span className="directory-folder" aria-hidden="true" />
        <strong>{node.name}</strong>
        <small>{node.total}</small>
      </button>
      {open ? (
        <div className="directory-children" role="group">
          {node.children.map((child) => (
            <DirectoryBranch
              node={child}
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
  const proficiencies = monster.proficiencies?.map((item) => `${item.proficiency.name.replace("Saving Throw: ", "").replace("Skill: ", "")} +${item.value}`).join(" · ");
  const edition = EDITIONS[monster.ruleset];

  return (
    <article className="monster-sheet">
      <header className="sheet-heading">
        <div>
          <p className="eyebrow">{edition.edition} · {edition.source}</p>
          <h2>{monster.name}</h2>
          {monster.name_en ? <p className="sheet-name-en">{monster.name_en}</p> : null}
          <p className="monster-kind">{monster.size} {monster.type}{monster.subtype ? ` (${monster.subtype})` : ""}，{monster.alignment}</p>
          <div className="sheet-tags"><span>{monster.catalog_category || "其他"}</span><span>中文资料</span><span>{edition.license}</span></div>
        </div>
        <div className="cr-seal" aria-label={`挑战等级 ${monster.challenge_rating}`}>
          <small>CR</small>
          <strong>{monster.challenge_rating}</strong>
        </div>
      </header>

      <div className="vital-grid">
        <div><span>护甲等级</span><strong>{armorValue(monster)}</strong>{armorDetailText(monster) ? <small>{armorDetailText(monster)}</small> : null}</div>
        <div><span>生命值</span><strong>{monster.hit_points}</strong><small>{monster.hit_dice}</small></div>
        <div><span>经验值</span><strong>{monster.xp.toLocaleString()}</strong><small>XP</small></div>
      </div>

      <dl className="quick-facts">
        <div><dt>速度</dt><dd>{speedText(monster) || "—"}</dd></div>
        {monster.initiative ? <div><dt>先攻</dt><dd>{monster.initiative}</dd></div> : null}
        <div><dt>感官</dt><dd>{sensesText(monster) || "—"}</dd></div>
        <div><dt>语言</dt><dd>{monster.languages || "—"}</dd></div>
        {monster.proficiency_bonus ? <div><dt>熟练加值</dt><dd>+{monster.proficiency_bonus}</dd></div> : null}
        {monster.saving_throws ? <div><dt>豁免</dt><dd>{monster.saving_throws}</dd></div> : null}
        {monster.skills ? <div><dt>技能</dt><dd>{monster.skills}</dd></div> : null}
        {monster.gear ? <div><dt>装备</dt><dd>{monster.gear}</dd></div> : null}
        {proficiencies ? <div><dt>熟练项</dt><dd>{proficiencies}</dd></div> : null}
      </dl>

      <div className="ability-grid" aria-label="属性值">
        {ABILITIES.map(([label, key]) => (
          <div key={key}>
            <span>{label}</span>
            <strong>{monster[key]}</strong>
            <small>{abilityModifier(monster[key])}</small>
          </div>
        ))}
      </div>

      <dl className="defense-list">
        <div><dt>伤害易伤</dt><dd>{listText(monster.damage_vulnerabilities)}</dd></div>
        <div><dt>伤害抗性</dt><dd>{listText(monster.damage_resistances)}</dd></div>
        <div><dt>伤害免疫</dt><dd>{listText(monster.damage_immunities)}</dd></div>
        <div><dt>状态免疫</dt><dd>{monster.condition_immunities?.length ? monster.condition_immunities.map((item) => item.name).join("、") : "—"}</dd></div>
      </dl>

      <FeatureList title="特质" items={monster.special_abilities} />
      <FeatureList title="动作" items={monster.actions} />
      <FeatureList title="附赠动作" items={monster.bonus_actions} />
      <FeatureList title="反应" items={monster.reactions} />
      <FeatureList title="传奇动作" items={monster.legendary_actions} />
      <FeatureList title="巢穴动作" items={monster.lair_actions} />

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
          <h1>Bestiary Forge</h1>
          <p>D&amp;D 2014 / 5E + 2024 / 5R 中文怪物图鉴</p>
        </div>
        <a className="source-link" href="/sources" target="_blank" rel="noreferrer">来源与许可</a>
        <div className="header-badge"><span>★</span>{favorites.length} 个收藏</div>
      </header>

      <div className="bestiary-workspace">
        <aside className="catalog-panel" aria-label="怪物目录">
          <div className="catalog-heading">
            <div>
              <p className="eyebrow">{EDITIONS[ruleset].source} · ZH-CN</p>
              <h2>怪物目录</h2>
            </div>
            <span>{filteredMonsters.length} / {monsters.length}</span>
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
            <span><i aria-hidden="true" />原始目录结构</span>
            <button type="button" onClick={toggleAllDirectories} disabled={!allDirectoryKeys.length || Boolean(query.trim())}>
              {allDirectoriesExpanded ? "全部收起" : "全部展开"}
            </button>
          </div>

          <p className="catalog-tip">点击文件夹逐级展开原怪物图鉴目录；搜索时会自动展开匹配路径。</p>

          <div className="monster-list" role="list" aria-label={`${EDITIONS[ruleset].short} 怪物目录树`}>
            {catalogState === "loading" ? <div className="catalog-message"><span className="spinner" />正在翻阅图鉴…</div> : null}
            {catalogState === "error" ? <div className="catalog-message error">本地中文数据库加载失败，请刷新重试。</div> : null}
            {catalogState === "ready" && !filteredMonsters.length ? <div className="catalog-message">没有找到匹配的怪物。</div> : null}
            {directoryTree.map((node) => (
              <DirectoryBranch
                node={node}
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
