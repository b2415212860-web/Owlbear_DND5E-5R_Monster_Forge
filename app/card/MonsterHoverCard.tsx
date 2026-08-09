"use client";

import { useEffect, useState } from "react";
import { abilityModifier, armorValue, type MonsterDetail } from "../types";

export function MonsterHoverCard() {
  const [monster, setMonster] = useState<MonsterDetail | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const index = new URLSearchParams(window.location.search).get("index");
    if (!index || !/^[a-z0-9-]+$/.test(index)) {
      setFailed(true);
      return;
    }
    fetch(`/api/monsters/${index}`)
      .then(async (response) => {
        if (!response.ok) throw new Error("not found");
        return (await response.json()) as MonsterDetail;
      })
      .then(setMonster)
      .catch(() => setFailed(true));
  }, []);

  if (failed) return <main className="hover-card hover-error">无法读取怪物资料</main>;
  if (!monster) return <main className="hover-card hover-loading">正在翻阅图鉴…</main>;

  return (
    <main className="hover-card">
      <header className="hover-header">
        <img src={`/api/tokens/${monster.index}`} alt="" />
        <div>
          <p>CR {monster.challenge_rating} · {monster.type}</p>
          <h1>{monster.name}</h1>
          <span>{monster.size} · {monster.alignment}</span>
        </div>
      </header>
      <div className="hover-vitals">
        <div><span>生命</span><strong>{monster.hit_points}</strong><small>{monster.hit_dice}</small></div>
        <div><span>护甲</span><strong>{armorValue(monster)}</strong><small>{monster.armor_class[0]?.type ?? "armor"}</small></div>
        <div><span>挑战</span><strong>{monster.challenge_rating}</strong><small>{monster.xp.toLocaleString()} XP</small></div>
      </div>
      <div className="hover-abilities">
        {([
          ["STR", monster.strength], ["DEX", monster.dexterity], ["CON", monster.constitution],
          ["INT", monster.intelligence], ["WIS", monster.wisdom], ["CHA", monster.charisma],
        ] as Array<[string, number]>).map(([label, score]) => (
          <div key={label}><span>{label}</span><b>{score}</b><small>{abilityModifier(score)}</small></div>
        ))}
      </div>
      <section className="hover-features">
        {(monster.special_abilities ?? []).slice(0, 2).map((feature) => (
          <p key={feature.name}><b>{feature.name}.</b> {feature.desc}</p>
        ))}
        {!monster.special_abilities?.length && monster.actions?.[0] && (
          <p><b>{monster.actions[0].name}.</b> {monster.actions[0].desc}</p>
        )}
      </section>
    </main>
  );
}
