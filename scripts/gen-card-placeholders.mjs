import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const OUT = join(process.cwd(), 'client', 'public', 'cards');
mkdirSync(OUT, { recursive: true });

const SUITS = [
  ['cups', '🏆'],
  ['coins', '💰'],
  ['swords', '⚔️'],
  ['batons', '🪵'],
];
const RANKS = ['1', '2', '3', '4', '5', '6', '7', 'J', 'Q', 'K'];

function esc(t) {
  return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function backSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900" viewBox="0 0 600 900">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#1d4e8c"/>
      <stop offset="100%" stop-color="#10284a"/>
    </linearGradient>
  </defs>
  <rect width="600" height="900" rx="40" fill="url(#g)" stroke="#e0c36a" stroke-width="12"/>
  <circle cx="300" cy="450" r="170" fill="none" stroke="rgba(224,195,106,0.35)" stroke-width="8"/>
  <circle cx="300" cy="450" r="95" fill="none" stroke="rgba(224,195,106,0.25)" stroke-width="6"/>
  <text x="300" y="460" font-family="system-ui, sans-serif" font-size="46" font-weight="800" fill="rgba(224,195,106,0.55)" text-anchor="middle">&#x1F0CF;</text>
</svg>`;
}

function rankChar(r) {
  return r === '1' ? 'A' : r;
}

function faceSvg(suit, sym, rank) {
  const rc = rankChar(rank);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900" viewBox="0 0 600 900">
  <rect width="600" height="900" rx="30" fill="#ffffff" stroke="#111" stroke-width="8"/>
  <text x="40" y="120" font-family="system-ui, sans-serif" font-size="110" font-weight="900" fill="#111">${esc(rc)}</text>
  <text x="44" y="175" font-family="system-ui, sans-serif" font-size="64" fill="#111">${esc(sym)}</text>
  <text x="560" y="780" font-family="system-ui, sans-serif" font-size="110" font-weight="900" fill="#111" transform="rotate(180 560 780)">${esc(rc)}</text>
  <text x="556" y="725" font-family="system-ui, sans-serif" font-size="64" fill="#111" transform="rotate(180 556 725)">${esc(sym)}</text>
  <text x="300" y="470" font-family="system-ui, sans-serif" font-size="220" fill="rgba(17,17,17,0.18)" text-anchor="middle">${esc(sym)}</text>
</svg>`;
}

writeFileSync(join(OUT, 'back.svg'), backSvg());

for (const [suit, sym] of SUITS) {
  for (const rank of RANKS) {
    writeFileSync(join(OUT, `${suit}-${rank}.svg`), faceSvg(suit, sym, rank));
  }
}

console.log(`Generated ${1 + SUITS.length * RANKS} placeholder SVGs in ${OUT}`);
