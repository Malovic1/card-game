export type Suit = 'cups' | 'coins' | 'swords' | 'batons';
export type Rank = '1' | '2' | '3' | '4' | '5' | '6' | '7' | 'J' | 'Q' | 'K';

export interface Card {
  id: string;
  suit: Suit;
  rank: Rank;
}

export interface Player {
  id: string;
  name: string;
  icon: string;
  seat: number;
  isBot: boolean;
  hand: Card[];
  cardCount?: number;
  connected: boolean;
}

export interface PlayedCard {
  seat: number;
  card: Card;
}

export interface Trick {
  plays: PlayedCard[];
  ledSuit: Suit | null;
  winnerSeat: number | null;
  complete: boolean;
}

export interface DeclarationOffer {
  id: string;
  name: string;
  points: number;
}

export interface CalledDeclaration extends DeclarationOffer {
  seat: number;
  team: 0 | 1;
}

export interface GameState {
  phase: 'lobby' | 'playing' | 'hand-over' | 'game-over';
  players: Player[];
  currentTurnSeat: number | null;
  trick: Trick | null;
  completedTricks: Array<{
    winnerSeat: number;
    cards: Card[];
  }>;
  scores: { 0: number; 1: number };
  handPoints: { 0: number; 1: number };
  declarations: CalledDeclaration[];
  callable?: DeclarationOffer[];
  lastTrickWinnerSeat: number | null;
  dealerSeat: number;
  targetPoints: number;
  winnerTeam: number | null;
  handNumber: number;
}

export interface Room {
  id: string;
  name: string;
  players: Player[];
  game: GameState | null;
  createdAt: number;
}

export function seatToTeam(seat: number): 0 | 1 {
  return seat % 2 === 0 ? 0 : 1;
}

export function isPartner(seatA: number, seatB: number): boolean {
  return seatToTeam(seatA) === seatToTeam(seatB);
}

export const SUITS: Suit[] = ['cups', 'coins', 'swords', 'batons'];
export const RANKS: Rank[] = ['1', '2', '3', '4', '5', '6', '7', 'J', 'Q', 'K'];

export const SUIT_LABELS: Record<Suit, string> = {
  cups: 'Kupe',
  coins: 'Dinari',
  swords: 'Špade',
  batons: 'Baštuni',
};

export interface RoomSummary {
  id: string;
  name: string;
  seated: number;
  humans: number;
  bots: number;
  started: boolean;
}

export const RANK_LABELS: Record<Rank, string> = {
  '1': 'As',
  '2': '2',
  '3': '3',
  '4': '4',
  '5': '5',
  '6': '6',
  '7': '7',
  J: 'Špic',
  Q: 'Konj',
  K: 'Kralj',
};

export const AVATARS = [
  '🃏', '👸', '🤴', '🤖', '🎩', '🦁', '🐯', '🐻',
  '🍇', '🍒', '🍋', '🍍', '⚡', '🔥', '💎', '⭐',
];
