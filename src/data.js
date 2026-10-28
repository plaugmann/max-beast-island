// Game data: rarities, animals, cubes, money (numbers straight from PLAN.md)

// chance in %, perSec = $/sec in the base, sell = sell price (null = can't be sold)
export const RARITIES = [
  { name: 'Common', color: '#c4cad2', chance: 55, perSec: 1, sell: 100 },
  { name: 'Uncommon', color: '#4fe06a', chance: 25, perSec: 3, sell: 300 },
  { name: 'Rare', color: '#3f9bff', chance: 12, perSec: 10, sell: 1000 },
  { name: 'Epic', color: '#b05cff', chance: 5, perSec: 30, sell: 3000 },
  { name: 'Legendary', color: '#ffe23d', chance: 2, perSec: 100, sell: 10000 },
  { name: 'Mythic', color: '#ff3b3b', chance: 0.7, perSec: 400, sell: 40000 },
  { name: 'Godly', color: '#ffb820', chance: 0.25, perSec: 1500, sell: 150000 },
  { name: 'Divine', color: '#ff7a1a', chance: 0.04, perSec: 6000, sell: 600000 },
  { name: 'Infinite', color: '#ff66e0', chance: 0.009, perSec: 25000, sell: 2500000 },
  { name: 'The Next Level', color: '#16121c', chance: 0.001, perSec: 100000, sell: 10000000 },
  { name: 'Ancient Legend', color: '#bfefff', chance: 0, perSec: 1000000, sell: null }, // only 1, in the secret cave
];
export const RARITY = Object.fromEntries(RARITIES.map((r, i) => [r.name, { ...r, index: i }]));

// biome: 'ice' / 'volcano' = prefers that area, otherwise anywhere on land
import { NEW_ANIMALS as LOW_ANIMALS } from './species/low.js';
import { NEW_ANIMALS as HIGH_ANIMALS } from './species/high.js';

export const ANIMALS = {
  Common: [
    { name: 'Rabbit', icon: '🐇' }, { name: 'Squirrel', icon: '🐿️' }, { name: 'Frog', icon: '🐸' }, { name: 'Pigeon', icon: '🐦' }],
  Uncommon: [
    { name: 'Fox', icon: '🦊' }, { name: 'Deer', icon: '🦌' }, { name: 'Raccoon', icon: '🦝' }, { name: 'Penguin', icon: '🐧', biome: 'ice' }],
  Rare: [
    { name: 'Wolf', icon: '🐺' }, { name: 'Snow Owl', icon: '🦉', biome: 'ice' }, { name: 'Lynx', icon: '🐈' }, { name: 'Crystal Beetle', icon: '🪲' }],
  Epic: [
    { name: 'Polar Bear', icon: '🐻‍❄️', biome: 'ice' }, { name: 'Lava Lizard', icon: '🦎', biome: 'volcano' }, { name: 'Thunder Hawk', icon: '🦅' }, { name: 'Moss Turtle', icon: '🐢' }],
  Legendary: [
    { name: 'Frost Wolf', icon: '🐺', biome: 'ice' }, { name: 'Fire Fox', icon: '🦊', biome: 'volcano' }, { name: 'Griffin', icon: '🦅' }, { name: 'Glacier Mammoth', icon: '🦣', biome: 'ice' }],
  Mythic: [
    { name: 'Phoenix', icon: '🔥' }, { name: 'Unicorn', icon: '🦄' }, { name: 'Shadow Stag', icon: '🦌' }, { name: 'Kraken Crab', icon: '🦀' }],
  Godly: [
    { name: 'Golden Dragon', icon: '🐉' }, { name: 'Storm Lion', icon: '🦁' }, { name: 'Sun Serpent', icon: '🐍' }, { name: 'Titan Bear', icon: '🐻' }],
  Divine: [
    { name: 'Inferno Wyvern', icon: '🐲', biome: 'volcano' }, { name: 'Angel Stag', icon: '🦌' }, { name: 'Sky Whale', icon: '🐋' }, { name: 'Magma Behemoth', icon: '🌋', biome: 'volcano' }],
  Infinite: [
    { name: 'Galaxy Dragon', icon: '🐉' }, { name: 'Cosmic Owl', icon: '🦉' }, { name: 'Time Turtle', icon: '🐢' }, { name: 'Prism Leviathan', icon: '🐍' }],
  'The Next Level': [
    { name: 'Void Wolf', icon: '🐺' }, { name: 'Eclipse Phoenix', icon: '🌑' }, { name: 'Black Hole Hydra', icon: '🐍' }, { name: 'Glitch Cat', icon: '🐱' }],
  'Ancient Legend': [{ name: 'The Absolute Beast', icon: '🐆' }],
};
for (const extra of [LOW_ANIMALS, HIGH_ANIMALS]) for (const [rar, list] of Object.entries(extra)) ANIMALS[rar].push(...list);

// Catch chance in % per rarity (Common ... The Next Level). Ancient Legend: battle first (later)
export const CUBES = [
  { id: 'rusty', name: 'Rusty Cube', price: 10, chances: [60, 40, 20, 8, 3, 1, 0, 0, 0, 0], color: '#8a4a26', glow: '#ff9a4a' },
  { id: 'old', name: 'Old Cube', price: 100, chances: [80, 60, 40, 20, 8, 3, 1, 0, 0, 0], color: '#5f6a5a', glow: '#d9e6a0' },
  { id: 'good', name: 'Good Cube', price: 1000, chances: [95, 80, 60, 40, 20, 8, 3, 1, 0, 0], color: '#1d4fb8', glow: '#7fe0ff' },
  { id: 'ultra', name: 'Ultra Cube', price: 25000, chances: [100, 95, 80, 60, 40, 20, 8, 3, 1, 0], color: '#2c1460', glow: '#ffd24a' },
  { id: 'master', name: 'Master Cube', price: 500000, chances: [100, 100, 95, 80, 60, 40, 20, 8, 3, 1], color: '#4a0a5e', glow: '#ff5cf2' },
  { id: 'admin', name: 'Admin Cube', price: null, chances: [100, 100, 100, 100, 100, 100, 100, 100, 100, 100], color: '#0b0b10', glow: '#ffffff', admin: true },
];

export const INVENTORY_SIZE = 19;
export const START_CUBES = { rusty: 15, old: 0, good: 0, ultra: 0, master: 0, admin: 0 }; // after the tutorial
export const TUTORIAL_CUBES = { rusty: 0, old: 0, good: 0, ultra: 0, master: 1, admin: 0 }; // brand new game
export const BASE_SLOTS = 10;

export function rollRarity(rng = Math.random) {
  let r = rng() * 100;
  for (const rar of RARITIES) { if (rar.chance <= 0) continue; if ((r -= rar.chance) < 0) return rar.name; }
  return 'Common';
}

export const fmtMoney = (n) => '$' + n.toLocaleString('en-US');
