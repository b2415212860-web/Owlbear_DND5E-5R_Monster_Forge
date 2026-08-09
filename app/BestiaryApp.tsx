"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import {
  abilityModifier,
  armorValue,
  sizeInCells,
  type MonsterDetail,
  type MonsterListEntry,
} from "./types";

const META_KEY = "com.shen.owlbear-bestiary/monster";

interface TokenStatus {
  monsterIndex: string;
  updatedAt: string;
}

interface DemoToken {
  id: number;
  monster: MonsterDetail;
  image: string;
  left: number;
  top: number;
}

function tokenUrl(index: string, version?: string) {
  const query = version ? `?v=${encodeURIComponent(version)}` : "";
  return `/api/tokens/${index}${query}`;
}

async function circularizeImage(file: File) {
  const bitmap = await createImageBitmap(file);
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("浏览器无法处理这张图片");

  const scale = Math.max(size / bitmap.width, size / bitmap.height);
  const width = bitmap.width * scale;
  const height = bitmap.height * scale;
  const x = (size - width) / 2;
  const y = (size - height) / 2;

  context.save();
  context.beginPath();
  context.arc(size / 2, size / 2, size / 2 - 8, 0, Math.PI * 2);
  context.clip();
  context.fillStyle = "#050505";
  context.fillRect(0, 0, size, size);
  context.drawImage(bitmap, x, y, width, height);
  context.restore();
  context.beginPath();
  context.arc(size / 2, size / 2, size / 2 - 8, 0, Math.PI * 2);
  context.lineWidth = 12;
  context.strokeStyle = "#d97836";
  context.stroke();
  bitmap.close();

  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("图片处理失败"))),
      "image/png",
      0.94
    )
  );
}

function speedText(monster: MonsterDetail) {
  return Object.entries(monster.speed)
    .filter(([, value]) => typeof value === "string")
    .map(([key, value]) => `${key === "walk" ? "步行" : key} ${value}`)
    .join(" · ");
}

function monsterSnapshot(monster: MonsterDetail) {
  return {
    index: monster.index,
    name: monster.name,
    size: monster.size,
    type: monster.type,
    alignment: monster.alignment,
    armorClass: armorValue(monster),
    hitPoints: monster.hit_points,
    maxHitPoints: monster.hit_points,
    hitDice: monster.hit_dice,
    speed: monster.speed,
    challengeRating: monster.challenge_rating,
    xp: monster.xp,
    abilities: {
      str: monster.strength,
      dex: monster.dexterity,
      con: monster.constitution,
      int: monster.intelligence,
      wis: monster.wisdom,
      cha: monster.charisma,
    },
    senses: monster.senses,
    languages: monster.languages,
    traits: monster.special_abilities ?? [],
    actions: monster.actions ?? [],
  };
}

export function BestiaryApp() {
  const [catalog, setCatalog] = useState<MonsterListEntry[]>([]);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<MonsterListEntry | null>(null);
  const [monster, setMonster] = useState<MonsterDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [catalogError, setCatalogError] = useState("");
  const [tokenRecords, setTokenRecords] = useState<Record<string, string>>({});
  const [connection, setConnection] = useState<"checking" | "connected" | "preview">("checking");
  const [sceneReady, setSceneReady] = useState(false);
  const [busy, setBusy] = useState<"upload" | "spawn" | "reset" | null>(null);
  const [notice, setNotice] = useState("");
  const [demoTokens, setDemoTokens] = useState<DemoToken[]>([]);
  const [activeTab, setActiveTab] = useState<"stats" | "actions">("stats");
  const uploadRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/monsters")
      .then(async (response) =>
        (await response.json()) as { results?: MonsterListEntry[]; degraded?: boolean }
      )
      .then((payload) => {
        if (cancelled) return;
        const results = payload.results ?? [];
        setCatalog(results);
        const first = results.find((entry) => entry.index === "owlbear") ?? results[0] ?? null;
        setSelected(first);
        if (payload.degraded) setCatalogError("怪物源暂时离线，当前显示离线精选列表");
      })
      .catch(() => setCatalogError("怪物目录加载失败，请稍后重试"));

    fetch("/api/tokens")
      .then(async (response) => (await response.json()) as { tokens?: TokenStatus[] })
      .then((payload) => {
        const next: Record<string, string> = {};
        for (const token of payload.tokens ?? []) next[token.monsterIndex] = token.updatedAt;
        if (!cancelled) setTokenRecords(next);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let disposed = false;
    let stopScene: () => void = () => {};
    void import("@owlbear-rodeo/sdk").then(({ default: OBR }) => {
      if (disposed) return;
      if (!OBR.isAvailable) {
        setConnection("preview");
        return;
      }
      OBR.onReady(async () => {
        if (disposed) return;
        setConnection("connected");
        setSceneReady(await OBR.scene.isReady());
        stopScene = OBR.scene.onReadyChange((ready) => setSceneReady(ready));
      });
    });
    return () => {
      disposed = true;
      stopScene();
    };
  }, []);

  useEffect(() => {
    if (!selected) return;
    const controller = new AbortController();
    setDetailLoading(true);
    setMonster(null);
    setActiveTab("stats");
    fetch(`/api/monsters/${selected.index}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("detail unavailable");
        return (await response.json()) as MonsterDetail;
      })
      .then(setMonster)
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setNotice("无法读取这个怪物的资料，请重试");
      })
      .finally(() => setDetailLoading(false));
    return () => controller.abort();
  }, [selected]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 3200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const filteredCatalog = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    if (!needle) return catalog;
    return catalog.filter((entry) => entry.name.toLocaleLowerCase().includes(needle));
  }, [catalog, query]);

  const uploaded = monster ? Boolean(tokenRecords[monster.index]) : false;
  const currentImage = monster
    ? uploaded
      ? tokenUrl(monster.index, tokenRecords[monster.index])
      : "/default-token.svg"
    : "/default-token.svg";

  async function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || !monster) return;
    setBusy("upload");
    try {
      if (!file.type.startsWith("image/")) throw new Error("请选择图片文件");
      const tokenBlob = await circularizeImage(file);
      const response = await fetch(`/api/tokens/${monster.index}`, {
        method: "POST",
        headers: {
          "Content-Type": "image/png",
          "X-Original-Filename": encodeURIComponent(file.name),
        },
        body: tokenBlob,
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "上传失败");
      setTokenRecords((records) => ({ ...records, [monster.index]: new Date().toISOString() }));
      setNotice(`${monster.name} 的圆形棋子已经保存`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "图片上传失败");
    } finally {
      setBusy(null);
      event.target.value = "";
    }
  }

  async function resetToken() {
    if (!monster) return;
    setBusy("reset");
    try {
      const response = await fetch(`/api/tokens/${monster.index}`, { method: "DELETE" });
      if (!response.ok) throw new Error("无法恢复默认图片");
      setTokenRecords((records) => {
        const next = { ...records };
        delete next[monster.index];
        return next;
      });
      setNotice("已恢复为黑色默认图片");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "操作失败");
    } finally {
      setBusy(null);
    }
  }

  async function spawnToken() {
    if (!monster) return;
    setBusy("spawn");
    try {
      if (connection !== "connected") {
        const count = demoTokens.length;
        setDemoTokens((tokens) => [
          ...tokens,
          {
            id: Date.now(),
            monster,
            image: currentImage,
            left: 18 + ((count * 21) % 58),
            top: 18 + ((count * 17) % 56),
          },
        ]);
        setNotice("已投放到右侧预览地图；在 Owlbear Rodeo 中安装后会投放到真实场景");
        return;
      }
      if (!sceneReady) throw new Error("请先在 Owlbear Rodeo 打开一个场景");

      const { default: OBR, buildImage } = await import("@owlbear-rodeo/sdk");

      const [width, height] = await Promise.all([
        OBR.viewport.getWidth(),
        OBR.viewport.getHeight(),
      ]);
      const position = await OBR.viewport.inverseTransformPoint({ x: width / 2, y: height / 2 });
      const cells = sizeInCells(monster.size);
      const imageUrl = new URL(
        tokenUrl(monster.index, tokenRecords[monster.index]),
        window.location.origin
      ).toString();
      const token = buildImage(
        {
          width: 512,
          height: 512,
          url: imageUrl,
          mime: uploaded ? "image/png" : "image/svg+xml",
        },
        { dpi: 512 / cells, offset: { x: 256, y: 256 } }
      )
        .name(monster.name)
        .description(`${monster.name} · HP ${monster.hit_points} · AC ${armorValue(monster)}`)
        .position(position)
        .layer("CHARACTER")
        .metadata({ [META_KEY]: monsterSnapshot(monster) })
        .plainText(`${monster.name}  ·  HP ${monster.hit_points}  ·  AC ${armorValue(monster)}`)
        .textItemType("LABEL")
        .fontSize(18)
        .fontWeight(700)
        .textFillColor("#fff7e8")
        .textStrokeColor("#17120f")
        .textStrokeWidth(4)
        .build();

      await OBR.scene.items.addItems([token]);
      await OBR.notification.show(`${monster.name} 已投放到地图中心`, "SUCCESS");
      setNotice("Token 已生成：生命与护甲已写入棋子资料");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "无法生成 Token");
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className="bestiary-app">
      <section className="extension-frame" aria-label="Bestiary Forge 扩展面板">
        <header className="app-header">
          <div className="brand-mark" aria-hidden="true">BF</div>
          <div className="brand-copy">
            <p className="eyebrow">OWLBEAR RODEO EXTENSION</p>
            <h1>Bestiary Forge</h1>
          </div>
          <span className={`connection-dot ${connection}`} title={connection === "connected" ? "已连接 Owlbear Rodeo" : "独立预览模式"} />
        </header>

        <div className="workspace">
          <aside className="monster-library">
            <div className="library-heading">
              <div>
                <p className="section-kicker">D&amp;D 5e · SRD 2014</p>
                <h2>怪物目录</h2>
              </div>
              <span>{catalog.length || "—"}</span>
            </div>
            <label className="search-box">
              <span aria-hidden="true">⌕</span>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索怪物…"
                aria-label="搜索怪物"
              />
            </label>
            {catalogError && <p className="catalog-note">{catalogError}</p>}
            <div className="monster-list" role="listbox" aria-label="怪物列表">
              {filteredCatalog.map((entry) => {
                const hasToken = Boolean(tokenRecords[entry.index]);
                return (
                  <button
                    key={entry.index}
                    className={`monster-row ${selected?.index === entry.index ? "selected" : ""}`}
                    onClick={() => setSelected(entry)}
                    role="option"
                    aria-selected={selected?.index === entry.index}
                  >
                    <span className="row-thumb">
                      <img
                        src={hasToken ? tokenUrl(entry.index, tokenRecords[entry.index]) : "/default-token.svg"}
                        alt=""
                      />
                    </span>
                    <span className="row-name">{entry.name}</span>
                    {hasToken && <span className="image-ready" aria-label="已上传图片">●</span>}
                  </button>
                );
              })}
              {!filteredCatalog.length && <p className="empty-list">没有找到匹配的怪物</p>}
            </div>
            <p className="license-note">规则数据来自开放的 5e SRD；可上传自有授权图片。</p>
          </aside>

          <section className="monster-detail" aria-live="polite">
            {detailLoading && (
              <div className="detail-loading">
                <span className="loading-rune">✦</span>
                <p>翻阅怪物图鉴…</p>
              </div>
            )}
            {!detailLoading && monster && (
              <>
                <div className="detail-hero">
                  <div className={`token-portrait ${uploaded ? "uploaded" : "default"}`}>
                    <img src={currentImage} alt={`${monster.name} 棋子`} />
                    <span>{uploaded ? "已配图" : "默认"}</span>
                  </div>
                  <div className="monster-title">
                    <p>CR {monster.challenge_rating} · {monster.size} {monster.type}</p>
                    <h2>{monster.name}</h2>
                    <p>{monster.alignment}</p>
                  </div>
                </div>

                <div className="core-stats">
                  <div><span>HP</span><strong>{monster.hit_points}</strong><small>{monster.hit_dice}</small></div>
                  <div><span>AC</span><strong>{armorValue(monster)}</strong><small>{monster.armor_class[0]?.type ?? "armor"}</small></div>
                  <div><span>XP</span><strong>{monster.xp.toLocaleString()}</strong><small>challenge</small></div>
                </div>

                <div className="detail-tabs" role="tablist">
                  <button className={activeTab === "stats" ? "active" : ""} onClick={() => setActiveTab("stats")} role="tab">属性</button>
                  <button className={activeTab === "actions" ? "active" : ""} onClick={() => setActiveTab("actions")} role="tab">特性 / 动作</button>
                </div>

                <div className="detail-scroll">
                  {activeTab === "stats" ? (
                    <>
                      <div className="ability-grid">
                        {([
                          ["STR", monster.strength], ["DEX", monster.dexterity], ["CON", monster.constitution],
                          ["INT", monster.intelligence], ["WIS", monster.wisdom], ["CHA", monster.charisma],
                        ] as Array<[string, number]>).map(([label, score]) => (
                          <div key={label}><span>{label}</span><strong>{score}</strong><small>{abilityModifier(score)}</small></div>
                        ))}
                      </div>
                      <dl className="fact-list">
                        <div><dt>速度</dt><dd>{speedText(monster)}</dd></div>
                        <div><dt>感官</dt><dd>{Object.entries(monster.senses).map(([key, value]) => `${key.replaceAll("_", " ")} ${value}`).join(" · ")}</dd></div>
                        <div><dt>语言</dt><dd>{monster.languages || "—"}</dd></div>
                        {!!monster.damage_resistances?.length && <div><dt>抗性</dt><dd>{monster.damage_resistances.join(", ")}</dd></div>}
                        {!!monster.damage_immunities?.length && <div><dt>免疫</dt><dd>{monster.damage_immunities.join(", ")}</dd></div>}
                      </dl>
                    </>
                  ) : (
                    <div className="feature-list">
                      {[...(monster.special_abilities ?? []), ...(monster.actions ?? []), ...(monster.legendary_actions ?? [])].map((feature, index) => (
                        <article key={`${feature.name}-${index}`}>
                          <h3>{feature.name}</h3>
                          <p>{feature.desc}</p>
                        </article>
                      ))}
                      {!monster.special_abilities?.length && !monster.actions?.length && <p className="empty-list">没有可显示的动作资料</p>}
                    </div>
                  )}
                </div>

                <div className="detail-actions">
                  <input ref={uploadRef} type="file" accept="image/*" onChange={handleUpload} hidden />
                  <button className="secondary-action" onClick={() => uploadRef.current?.click()} disabled={busy !== null}>
                    <span aria-hidden="true">↥</span>{busy === "upload" ? "处理中…" : uploaded ? "更换图片" : "上传图片"}
                  </button>
                  {uploaded && <button className="reset-action" onClick={resetToken} disabled={busy !== null} title="恢复黑色默认图片">↺</button>}
                  <button className="primary-action" onClick={spawnToken} disabled={busy !== null || !monster}>
                    <span aria-hidden="true">✦</span>{busy === "spawn" ? "投放中…" : "生成 TOKEN"}
                  </button>
                </div>
              </>
            )}
          </section>
        </div>
      </section>

      <section className="map-preview" aria-label="Token 地图预览">
        <div className="map-toolbar">
          <span>荒野遭遇 · GM 视图</span>
          <span className="map-hint">地图中心预览</span>
        </div>
        <div className="map-canvas">
          <div className="map-water" />
          <div className="map-path" />
          <div className="map-label">NORTHWATCH<br />WILDS</div>
          {demoTokens.map((token) => (
            <div
              className="demo-token"
              key={token.id}
              style={{ left: `${token.left}%`, top: `${token.top}%` }}
              tabIndex={0}
            >
              <img src={token.image} alt={token.monster.name} />
              <span className="demo-hp">HP {token.monster.hit_points}</span>
              <span className="demo-ac">{armorValue(token.monster)}</span>
              <article className="demo-card">
                <p>CR {token.monster.challenge_rating} · {token.monster.type}</p>
                <h3>{token.monster.name}</h3>
                <div><b>HP {token.monster.hit_points}</b><b>AC {armorValue(token.monster)}</b></div>
                <small>{token.monster.size} · {token.monster.alignment}</small>
              </article>
            </div>
          ))}
          {!demoTokens.length && (
            <div className="map-empty">
              <span>✦</span>
              <p>从左侧选择怪物并生成 TOKEN</p>
            </div>
          )}
        </div>
        <footer className="preview-footer">
          <span className="hover-tool-dot">◉</span>
          安装到 Owlbear Rodeo 后，在移动工具中选择“鉴定怪物”，悬停 Token 即可查看资料卡
        </footer>
      </section>

      {notice && <div className="toast" role="status">{notice}</div>}
    </main>
  );
}
