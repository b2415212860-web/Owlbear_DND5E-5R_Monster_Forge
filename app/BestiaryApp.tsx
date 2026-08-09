"use client";

import { useEffect, useMemo, useState } from "react";
import { abilityModifier, armorValue, type MonsterDetail, type MonsterListEntry } from "./types";

const FAVORITES_STORAGE = "bestiary-forge/favorites-v1";
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
  return Object.entries(monster.senses)
    .map(([key, value]) => `${key.replaceAll("_", " ")} ${value}`)
    .join(" · ");
}

function FeatureList({ title, items }: { title: string; items?: MonsterDetail["actions"] }) {
  if (!items?.length) return null;
  return (
    <section className="feature-section">
      <div className="section-rule"><span>{title}</span></div>
      <div className="feature-list">
        {items.map((item, index) => (
          <article className="feature" key={`${item.name}-${index}`}>
            <h4>{item.name}</h4>
            <p>{item.desc}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function MonsterSheet({ monster }: { monster: MonsterDetail }) {
  const proficiencies = monster.proficiencies?.map((item) => `${item.proficiency.name.replace("Saving Throw: ", "").replace("Skill: ", "")} +${item.value}`).join(" · ");

  return (
    <article className="monster-sheet">
      <header className="sheet-heading">
        <div>
          <p className="eyebrow">收藏资料卡</p>
          <h2>{monster.name}</h2>
          <p className="monster-kind">{monster.size} {monster.type}{monster.subtype ? ` (${monster.subtype})` : ""}，{monster.alignment}</p>
        </div>
        <div className="cr-seal" aria-label={`挑战等级 ${monster.challenge_rating}`}>
          <small>CR</small>
          <strong>{monster.challenge_rating}</strong>
        </div>
      </header>

      <div className="vital-grid">
        <div><span>护甲等级</span><strong>{armorValue(monster)}</strong></div>
        <div><span>生命值</span><strong>{monster.hit_points}</strong><small>{monster.hit_dice}</small></div>
        <div><span>经验值</span><strong>{monster.xp.toLocaleString()}</strong><small>XP</small></div>
      </div>

      <dl className="quick-facts">
        <div><dt>速度</dt><dd>{speedText(monster) || "—"}</dd></div>
        <div><dt>感官</dt><dd>{sensesText(monster) || "—"}</dd></div>
        <div><dt>语言</dt><dd>{monster.languages || "—"}</dd></div>
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

      <FeatureList title="特性" items={monster.special_abilities} />
      <FeatureList title="动作" items={monster.actions} />
      <FeatureList title="传奇动作" items={monster.legendary_actions} />
    </article>
  );
}

export function BestiaryApp() {
  const [monsters, setMonsters] = useState<MonsterListEntry[]>([]);
  const [query, setQuery] = useState("");
  const [catalogState, setCatalogState] = useState<"loading" | "ready" | "error">("loading");
  const [favorites, setFavorites] = useState<MonsterListEntry[]>([]);
  const [activeIndex, setActiveIndex] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, MonsterDetail>>({});
  const [detailState, setDetailState] = useState<"idle" | "loading" | "error">("idle");
  const [favoritesReady, setFavoritesReady] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/monsters", { signal: controller.signal })
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
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const stored = window.localStorage.getItem(FAVORITES_STORAGE);
        const parsed = stored ? JSON.parse(stored) as MonsterListEntry[] : [];
        if (Array.isArray(parsed)) {
          const safe = parsed.filter((item) => item && typeof item.index === "string" && typeof item.name === "string");
          setFavorites(safe);
          setActiveIndex(safe[0]?.index ?? null);
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
    if (!activeIndex || details[activeIndex]) return;
    const selectedIndex = activeIndex;
    const controller = new AbortController();
    async function loadDetail() {
      await Promise.resolve();
      if (controller.signal.aborted) return;
      setDetailState("loading");
      try {
        const response = await fetch(`/api/monsters/${encodeURIComponent(selectedIndex)}`, { signal: controller.signal });
        if (!response.ok) throw new Error("detail");
        const monster = await response.json() as MonsterDetail;
        setDetails((current) => ({ ...current, [selectedIndex]: monster }));
        setDetailState("idle");
      } catch (error: unknown) {
        if (!(error instanceof DOMException && error.name === "AbortError")) setDetailState("error");
      }
    }
    void loadDetail();
    return () => controller.abort();
  }, [activeIndex, details]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 2800);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const favoriteIndexes = useMemo(() => new Set(favorites.map((item) => item.index)), [favorites]);
  const filteredMonsters = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return normalized ? monsters.filter((monster) => monster.name.toLocaleLowerCase().includes(normalized)) : monsters;
  }, [monsters, query]);
  const activeMonster = activeIndex ? details[activeIndex] : undefined;

  function addFavorite(monster: MonsterListEntry) {
    setFavorites((current) => current.some((item) => item.index === monster.index) ? current : [...current, monster]);
    setActiveIndex(monster.index);
    setNotice(`已收藏 ${monster.name}`);
  }

  function removeFavorite(index: string) {
    setFavorites((current) => {
      const position = current.findIndex((item) => item.index === index);
      const next = current.filter((item) => item.index !== index);
      if (activeIndex === index) setActiveIndex(next[Math.min(position, next.length - 1)]?.index ?? null);
      return next;
    });
    setNotice("已从收藏中移除");
  }

  function toggleFavorite(monster: MonsterListEntry) {
    if (favoriteIndexes.has(monster.index)) removeFavorite(monster.index);
    else addFavorite(monster);
  }

  function openMonster(monster: MonsterListEntry) {
    if (favoriteIndexes.has(monster.index)) {
      setActiveIndex(monster.index);
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
          <p>D&amp;D 5e SRD 怪物收藏图鉴</p>
        </div>
        <div className="header-badge"><span>★</span>{favorites.length} 个收藏</div>
      </header>

      <div className="bestiary-workspace">
        <aside className="catalog-panel" aria-label="怪物目录">
          <div className="catalog-heading">
            <div>
              <p className="eyebrow">Monster index</p>
              <h2>怪物目录</h2>
            </div>
            <span>{filteredMonsters.length} / {monsters.length}</span>
          </div>

          <label className="search-box">
            <span aria-hidden="true">⌕</span>
            <span className="sr-only">搜索怪物</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索怪物名称…" />
            {query ? <button type="button" aria-label="清除搜索" onClick={() => setQuery("")}>×</button> : null}
          </label>

          <p className="catalog-tip">点击星标收藏；资料卡会在右侧新增标签页。</p>

          <div className="monster-list" role="list">
            {catalogState === "loading" ? <div className="catalog-message"><span className="spinner" />正在翻阅图鉴…</div> : null}
            {catalogState === "error" ? <div className="catalog-message error">目录加载失败，请稍后刷新。</div> : null}
            {catalogState === "ready" && !filteredMonsters.length ? <div className="catalog-message">没有找到匹配的怪物。</div> : null}
            {filteredMonsters.map((monster, index) => {
              const favorite = favoriteIndexes.has(monster.index);
              return (
                <div className={`monster-row${activeIndex === monster.index ? " active" : ""}`} role="listitem" key={monster.index}>
                  <button className="monster-name-button" type="button" onClick={() => openMonster(monster)}>
                    <span className="catalog-number">{String(index + 1).padStart(3, "0")}</span>
                    <span>{monster.name}</span>
                  </button>
                  <button
                    className={`favorite-button${favorite ? " favorite" : ""}`}
                    type="button"
                    aria-label={favorite ? `取消收藏 ${monster.name}` : `收藏 ${monster.name}`}
                    aria-pressed={favorite}
                    title={favorite ? "取消收藏" : "加入收藏"}
                    onClick={() => toggleFavorite(monster)}
                  >
                    <span aria-hidden="true">{favorite ? "★" : "☆"}</span>
                  </button>
                </div>
              );
            })}
          </div>
        </aside>

        <section className="card-browser" aria-label="收藏怪物资料卡">
          <div className="browser-chrome">
            <div className="window-dots" aria-hidden="true"><i /><i /><i /></div>
            <nav className="tab-strip" aria-label="收藏资料卡导航">
              {favorites.map((favorite) => (
                <div className={`browser-tab${activeIndex === favorite.index ? " active" : ""}`} key={favorite.index}>
                  <button className="tab-select" type="button" onClick={() => setActiveIndex(favorite.index)}>
                    <span aria-hidden="true">★</span>
                    <span>{favorite.name}</span>
                  </button>
                  <button className="tab-close" type="button" onClick={() => removeFavorite(favorite.index)} aria-label={`关闭 ${favorite.name} 资料卡`}>×</button>
                </div>
              ))}
              {!favorites.length ? <span className="empty-tab-label">收藏标签页</span> : null}
            </nav>
            <span className="local-label" title="收藏仅保存在当前浏览器">本机</span>
          </div>

          <div className="browser-toolbar">
            <button type="button" disabled aria-label="后退">‹</button>
            <button type="button" disabled aria-label="前进">›</button>
            <div className="address-bar"><span aria-hidden="true">✦</span>{activeIndex ? `bestiary.local/monster/${activeIndex}` : "bestiary.local/favorites"}</div>
          </div>

          <div className="card-viewport">
            {!favorites.length ? (
              <div className="empty-state">
                <div className="empty-emblem" aria-hidden="true">☆</div>
                <p className="eyebrow">Your field notes</p>
                <h2>这里还没有收藏</h2>
                <p>从左侧怪物目录点击星标，怪物资料卡会像浏览器标签页一样依次打开在这里。</p>
                <span>收藏会保存在当前浏览器与设备中</span>
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
