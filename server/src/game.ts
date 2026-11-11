import type {
  Card,
  GameState,
  Player,
  Rank,
  Suit,
  Trick,
} from './types';
import {
  CARD_POWER,
  CARD_VALUE,
  CARDS_PER_PLAYER,
  DEFAULT_TARGET_POINTS,
  LAST_TRICK_BONUS,
  nextSeat,
  seatToTeam,
} from './types';

export function createDeck(): Card[] {
  const cards: Card[] = [];
  let id = 0;
  for (const suit of ['cups', 'coins', 'swords', 'batons'] as Suit[]) {
    for (const rank of [
      '1', '2', '3', '4', '5', '6', '7', 'J', 'Q', 'K',
    ] as Rank[]) {
      cards.push({ id: `c${id++}`, suit, rank });
    }
  }
  return cards;
}

export function shuffle<T>(array: T[]): T[] {
  const a = array.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function createPlayer({
  id,
  name,
  icon,
  seat,
  isBot = false,
  connected = !isBot,
}: {
  id: string;
  name: string;
  icon: string;
  seat: number;
  isBot?: boolean;
  connected?: boolean;
}): Player {
  return {
    id,
    name,
    icon,
    seat,
    isBot,
    hand: [],
    connected,
  };
}

export function newGameState(dealerSeat: number): GameState {
  return {
    phase: 'playing',
    players: [],
    currentTurnSeat: null,
    trick: null,
    completedTricks: [],
    scores: { 0: 0, 1: 0 },
    handPoints: { 0: 0, 1: 0 },
    lastTrickWinnerSeat: null,
    dealerSeat,
    targetPoints: DEFAULT_TARGET_POINTS,
    winnerTeam: null,
    handNumber: 0,
  };
}

export function dealCards(): Card[][] {
  const deck = shuffle(createDeck());
  const hands: Card[][] = [[], [], [], []];
  for (let i = 0; i < deck.length; i++) {
    hands[i % 4].push(deck[i]);
  }
  return hands;
}

export function legalCards(hand: Card[], ledSuit: Suit | null): Card[] {
  if (!ledSuit) return hand.slice();
  const follow = hand.filter((c) => c.suit === ledSuit);
  return (follow.length > 0 ? follow : hand).slice();
}

export function hasSuit(hand: Card[], suit: Suit): boolean {
  return hand.some((c) => c.suit === suit);
}

export function findCard(hand: Card[], cardId: string): Card | undefined {
  return hand.find((c) => c.id === cardId);
}

export function removeCard(hand: Card[], cardId: string): Card[] {
  return hand.filter((c) => c.id !== cardId);
}

export function playCard(
  game: GameState,
  seat: number,
  card: Card,
): { game: GameState; trickComplete: boolean } {
  if (game.phase !== 'playing') throw new Error('Ruka nije u tijeku');
  if (game.trick?.complete) throw new Error('Pričekajte kraj štiha');
  if (game.currentTurnSeat !== seat) throw new Error('Niste na redu');

  const player = game.players.find((p) => p.seat === seat);
  if (!player) throw new Error('Igrač nije pronađen');
  if (!findCard(player.hand, card.id)) throw new Error('Karta nije u ruci');

  const ledSuit = game.trick?.ledSuit ?? null;
  if (ledSuit && card.suit !== ledSuit && hasSuit(player.hand, ledSuit)) {
    throw new Error('Morate odgovoriti u boji');
  }

  const nextPlayers = game.players.map((p: Player) =>
    p.seat === seat ? { ...p, hand: removeCard(p.hand, card.id) } : p,
  );

  const trick: Trick = game.trick
    ? { ...game.trick, plays: [...game.trick.plays, { seat, card }] }
    : {
        plays: [{ seat, card }],
        ledSuit: card.suit,
        winnerSeat: null,
        complete: false,
      };

  if (trick.plays.length < 4) {
    return {
      trickComplete: false,
      game: {
        ...game,
        players: nextPlayers,
        trick,
        currentTurnSeat: nextSeat(seat),
      },
    };
  }

  const winnerSeat = resolveTrickWinner(trick);
  return {
    trickComplete: true,
    game: {
      ...game,
      players: nextPlayers,
      currentTurnSeat: null,
      trick: { ...trick, winnerSeat, complete: true },
    },
  };
}

/** Score a finished trick and either give the lead to the winner or close the hand. */
export function advanceAfterTrick(game: GameState): GameState {
  const trick = game.trick;
  if (!trick?.complete || trick.winnerSeat === null) return game;

  const winnerSeat = trick.winnerSeat;
  const team = seatToTeam(winnerSeat);
  const trickPoints = trick.plays.reduce((sum, play) => sum + CARD_VALUE[play.card.rank], 0);
  const completedTricks = [
    ...game.completedTricks,
    { winnerSeat, cards: trick.plays.map((play) => play.card) },
  ];
  const handPoints = { ...game.handPoints };
  handPoints[team] += trickPoints;

  if (completedTricks.length < CARDS_PER_PLAYER) {
    return {
      ...game,
      players: game.players,
      completedTricks,
      handPoints,
      trick: null,
      currentTurnSeat: winnerSeat,
      lastTrickWinnerSeat: winnerSeat,
    };
  }

  handPoints[team] += LAST_TRICK_BONUS;
  const scores = { ...game.scores };
  scores[0] += handPoints[0];
  scores[1] += handPoints[1];

  let phase: GameState['phase'] = 'hand-over';
  let winnerTeam: number | null = null;
  if (scores[0] >= game.targetPoints || scores[1] >= game.targetPoints) {
    if (scores[0] !== scores[1]) {
      winnerTeam = scores[0] > scores[1] ? 0 : 1;
      phase = 'game-over';
    }
  }

  return {
    ...game,
    completedTricks,
    handPoints,
    scores,
    trick: null,
    currentTurnSeat: null,
    lastTrickWinnerSeat: winnerSeat,
    phase,
    winnerTeam,
  };
}

function resolveTrickWinner(trick: Trick): number {
  const ledSuit = trick.ledSuit!;
  let best = trick.plays[0];
  for (const play of trick.plays) {
    if (play.card.suit === ledSuit) {
      if (
        best.card.suit !== ledSuit ||
        CARD_POWER[play.card.rank] > CARD_POWER[best.card.rank]
      ) {
        best = play;
      }
    }
  }
  return best.seat;
}

export function startHand(
  game: GameState,
  players: Player[],
  dealerSeat: number,
): GameState {
  if (players.length !== 4 || players.some((p) => p.seat < 0 || p.seat > 3)) {
    throw new Error('Potrebna su 4 igrača');
  }
  const hands = dealCards();
  const nextPlayers = players.map((p) => ({
    ...p,
    hand: (hands[p.seat] ?? []).slice(),
  }));

  return {
    ...game,
    phase: 'playing',
    players: nextPlayers,
    currentTurnSeat: nextSeat(dealerSeat),
    trick: null,
    completedTricks: [],
    handPoints: { 0: 0, 1: 0 },
    lastTrickWinnerSeat: null,
    winnerTeam: null,
    handNumber: game.handNumber + 1,
    dealerSeat,
  };
}

function weakest(cards: Card[]): Card {
  return cards.slice().sort((a, b) => CARD_POWER[a.rank] - CARD_POWER[b.rank])[0];
}

export function botChooseCard(
  hand: Card[],
  ledSuit: Suit | null,
  trick: Trick | null,
  seat: number,
): Card {
  const legal = legalCards(hand, ledSuit);
  if (!ledSuit || !trick || trick.plays.length === 0) {
    const junk = legal.filter((c) => CARD_VALUE[c.rank] === 0);
    return weakest(junk.length > 0 ? junk : legal);
  }

  const winning = trick.plays.reduce((best, play) => {
    if (play.card.suit !== ledSuit) return best;
    if (best.card.suit !== ledSuit || CARD_POWER[play.card.rank] > CARD_POWER[best.card.rank]) {
      return play;
    }
    return best;
  }, trick.plays[0]);

  if (winning.seat !== seat && seatToTeam(winning.seat) === seatToTeam(seat)) {
    return weakest(legal);
  }

  const winnerIsLed = winning.card.suit === ledSuit;
  const beaters = legal
    .filter((c) => {
      if (c.suit !== ledSuit) return false;
      if (!winnerIsLed) return true;
      return CARD_POWER[c.rank] > CARD_POWER[winning.card.rank];
    })
    .sort((a, b) => CARD_POWER[a.rank] - CARD_POWER[b.rank]);

  return beaters.length > 0 ? beaters[0] : weakest(legal);
}
