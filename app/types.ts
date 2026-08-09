export interface MonsterListEntry {
  index: string;
  name: string;
  url: string;
}

export interface ArmorClassEntry {
  type?: string;
  value: number;
  desc?: string;
}

export interface MonsterFeature {
  name: string;
  desc: string;
  attack_bonus?: number;
}

export interface MonsterDetail extends MonsterListEntry {
  size: string;
  type: string;
  subtype?: string;
  alignment: string;
  armor_class: ArmorClassEntry[];
  hit_points: number;
  hit_dice: string;
  hit_points_roll?: string;
  speed: Record<string, string | boolean>;
  strength: number;
  dexterity: number;
  constitution: number;
  intelligence: number;
  wisdom: number;
  charisma: number;
  proficiencies?: Array<{ value: number; proficiency: { index: string; name: string } }>;
  damage_vulnerabilities?: string[];
  damage_resistances?: string[];
  damage_immunities?: string[];
  condition_immunities?: Array<{ index: string; name: string }>;
  senses: Record<string, string | number>;
  languages: string;
  challenge_rating: number;
  proficiency_bonus?: number;
  xp: number;
  special_abilities?: MonsterFeature[];
  actions?: MonsterFeature[];
  legendary_actions?: MonsterFeature[];
}

export function armorValue(monster: MonsterDetail) {
  return Math.max(0, ...monster.armor_class.map((entry) => entry.value));
}

export function abilityModifier(score: number) {
  const value = Math.floor((score - 10) / 2);
  return value >= 0 ? `+${value}` : String(value);
}

export function sizeInCells(size: string) {
  return ({ Tiny: 0.5, Small: 1, Medium: 1, Large: 2, Huge: 3, Gargantuan: 4 } as Record<string, number>)[size] ?? 1;
}
