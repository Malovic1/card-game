import type { Card, Rank, Suit, Trick } from '../types';

export const CARD_POWER: Record<Rank, number> = {
  '3': 10, '2': 9, '1': 8, 'K': 7, 'Q': 6, 'J': 5, '7': 4, '6': 3, '5': 2, '4': 1,
};

export const CARD_VALUE: Record<Rank, number> = {
  '1': 3, '3': 1, '2': 1, 'J': 1, 'Q': 1, 'K': 1, '4': 0, '5': 0, '6': 0, '7': 0,
};

export function cardLabel(card: Card): string {
  return `${rankGlyph(card.rank)} ${suitSymbol(card.suit)}`;
}

export function rankGlyph(rank: Rank): string {
  return rank === '1' ? 'A' : rank;
}

/** Card points are stored in thirds (ace = 3). Show them as whole points and thirds. */
export function formatPoints(thirds: number): string {
  const sign = thirds < 0 ? '-' : '';
  const value = Math.abs(Math.round(thirds));
  const whole = Math.floor(value / 3);
  const rem = value % 3;
  const frac = rem === 1 ? '⅓' : rem === 2 ? '⅔' : '';
  if (whole === 0) return sign + (frac || '0');
  return sign + String(whole) + frac;
}

export function suitSymbol(suit: Suit): string {
  switch (suit) {
    case 'cups': return '🏆';
    case 'coins': return '💰';
    case 'swords': return '⚔️';
    case 'batons': return '🪵';
    default: return '♠';
  }
}

export function cardColor(suit: Suit): string {
  switch (suit) {
    case 'cups': return '#c0392b';
    case 'coins': return '#b7950b';
    case 'swords': return '#27ae60';
    case 'batons': return '#8e44ad';
    default: return '#000';
  }
}

function ledWinningPower(trick: Trick): number {
  const led = trick.ledSuit;
  if (!led) return -1;
  let power = -1;
  for (const play of trick.plays) {
    if (play.card.suit === led) power = Math.max(power, CARD_POWER[play.card.rank]);
  }
  return power;
}

/** A card may be played: follow suit, and overtake the trick when you can. */
export function isLegalCard(hand: Card[], trick: Trick | null, card: Card): boolean {
  if (!trick || trick.complete || trick.plays.length === 0 || !trick.ledSuit) return true;
  const follow = hand.filter((c) => c.suit === trick.ledSuit);
  if (follow.length === 0) return true;
  if (card.suit !== trick.ledSuit) return false;
  const beaters = follow.filter((c) => CARD_POWER[c.rank] > ledWinningPower(trick));
  if (beaters.length === 0) return true;
  return beaters.some((c) => c.id === card.id);
}

export function mustPlayHigher(hand: Card[], trick: Trick | null): boolean {
  if (!trick || trick.complete || trick.plays.length === 0 || !trick.ledSuit) return false;
  const follow = hand.filter((c) => c.suit === trick.ledSuit);
  if (follow.length === 0) return false;
  return follow.some((c) => CARD_POWER[c.rank] > ledWinningPower(trick));
}

export function sortHand(hand: Card[]): Card[] {
  return [...hand].sort((a, b) => {
    if (a.suit !== b.suit) return a.suit.localeCompare(b.suit);
    return CARD_POWER[b.rank] - CARD_POWER[a.rank];
  });
}
