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
  seat: number; // 0-3
  isBot: boolean;
  hand: Card[];
  /** How many cards this player holds. Set on redacted views when `hand` is hidden. */
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

export interface GameState {
  phase: 'lobby' | 'playing' | 'hand-over' | 'game-over';
  players: Player[];
  currentTurnSeat: number | null;
  trick: Trick | null;
  completedTricks: Array<{
    winnerSeat: number;
    cards: Card[];
  }>;
  scores: { 0: number; 1: number }; // total match points per team
  handPoints: { 0: number; 1: number }; // current hand card points per team
  lastTrickWinnerSeat: number | null;
  dealerSeat: number;
  targetPoints: number;
  winnerTeam: number | null;
  handNumber: number;
}

// team 0 = seats 0 & 2, team 1 = seats 1 & 3
export function seatToTeam(seat: number): 0 | 1 {
  return seat % 2 === 0 ? 0 : 1;
}

export function isPartner(seatA: number, seatB: number): boolean {
  return seatToTeam(seatA) === seatToTeam(seatB);
}

export function nextSeat(seat: number): number {
  return (seat + 1) % 4;
}

export function prevSeat(seat: number): number {
  return (seat + 3) % 4;
}

// Trésette card ranking (high -> low): 3, 2, 1(Ace), K, Q, J, 7, 6, 5, 4
export const CARD_POWER: Record<Rank, number> = {
  '3': 10,
  '2': 9,
  '1': 8,
  'K': 7,
  'Q': 6,
  'J': 5,
  '7': 4,
  '6': 3,
  '5': 2,
  '4': 1,
};

// Scoring values (x3 integer scale to avoid fractions)
// Ace=1pt, 3=1/3, 2=1/3, J/Q/K=1/3 each, others=0. Last trick = 1pt.
export const CARD_VALUE: Record<Rank, number> = {
  '1': 3,
  '3': 1,
  '2': 1,
  'J': 1,
  'Q': 1,
  'K': 1,
  '4': 0,
  '5': 0,
  '6': 0,
  '7': 0,
};

export const LAST_TRICK_BONUS = 3;
export const POINTS_PER_HAND_TOTAL = 35; // 32 card points + 3 last trick
// Match is to 21 points. Values are stored in thirds, so 21 points = 63.
export const DEFAULT_TARGET_POINTS = 63;
export const CARDS_PER_PLAYER = 10;
export const PLAYER_COUNT = 4;

export const SUITS: Suit[] = ['cups', 'coins', 'swords', 'batons'];
export const RANKS: Rank[] = [
  '1', '2', '3', '4', '5', '6', '7', 'J', 'Q', 'K',
];

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
  '1': '1 (As)',
  '2': '2',
  '3': '3',
  '4': '4',
  '5': '5',
  '6': '6',
  '7': '7',
  J: 'Špic (J)',
  Q: 'Konj (Q)',
  K: 'Kralj (K)',
};

export interface Room {
  id: string;
  name: string;
  players: Player[]; // length 4, empty seats have null-ish placeholder
  game: GameState | null;
  createdAt: number;
}

export interface ServerToClientEvents {
  'error': (payload: { message: string }) => void;
  'room-state': (payload: { room: Room }) => void;
  'game-state': (payload: { game: GameState }) => void;
}

export interface ClientToServerEvents {
  'join-room': (
    payload: { name: string; icon: string; roomId?: string; roomName?: string },
    cb: (resp: { ok: boolean; player?: Player; room?: Room; game?: GameState | null; error?: string }) => void,
  ) => void;
  'leave-room': () => void;
  'list-rooms': (cb: (rooms: RoomSummary[]) => void) => void;
  'rename-room': (payload: { roomId: string; name: string }) => void;
  'start-game': (
    payload: { roomId: string; playerId: string },
    cb: (resp: { ok: boolean; error?: string }) => void,
  ) => void;
  'play-card': (
    payload: { roomId: string; cardId: string },
    cb?: (resp: { ok: boolean; error?: string }) => void,
  ) => void;
  'next-hand': () => void;
  'toggle-bot': (payload: { roomId: string; seat: number; isBot: boolean }) => void;
}

export interface InterServerEvents {
  ping: () => void;
}

export interface SocketData {
  playerId: string | null;
  roomId: string | null;
}
