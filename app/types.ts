export type RulesEdition = "5e" | "5r";

export interface MonsterListEntry {
  index: string;
  name: string;
  name_en?: string;
  url: string;
  ruleset: RulesEdition;
  catalog_category: string;
}

export interface ArmorClassEntry {
  type?: string;
  value: number;
  desc?: string;
}

export interface MonsterFeature {
  name: string;
  name_en?: string;
  desc: string;
  attack_bonus?: number;
}

export interface MonsterDetail extends MonsterListEntry {
  edition?: string;
  source?: string;
  source_file?: string;
  source_url?: string;
  source_commit?: string;
  source_license?: string;
  source_block?: number;
  size: string;
  type: string;
  subtype?: string;
  alignment: string;
  armor_class: ArmorClassEntry[];
  initiative?: string;
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
  saving_throws?: string;
  skills?: string;
  gear?: string;
  damage_vulnerabilities?: string[];
  damage_resistances?: string[];
  damage_immunities?: string[];
  condition_immunities?: Array<{ index: string; name: string }>;
  senses: Record<string, string | number>;
  senses_text?: string;
  languages: string;
  challenge_rating: number;
  proficiency_bonus?: number;
  xp: number;
  special_abilities?: MonsterFeature[];
  actions?: MonsterFeature[];
  bonus_actions?: MonsterFeature[];
  reactions?: MonsterFeature[];
  legendary_actions?: MonsterFeature[];
  lair_actions?: MonsterFeature[];
}

export function armorValue(monster: MonsterDetail) {
  return Math.max(0, ...monster.armor_class.map((entry) => entry.value));
}

export function abilityModifier(score: number) {
  const value = Math.floor((score - 10) / 2);
  return value >= 0 ? `+${value}` : String(value);
}
