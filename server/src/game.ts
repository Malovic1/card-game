import type {
  Card,
  DeclarationOffer,
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
    declarations: [],
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

function ledWinningPower(trick: Trick): number {
  const led = trick.ledSuit;
  if (!led) return -1;
  let power = -1;
  for (const play of trick.plays) {
    if (play.card.suit === led) power = Math.max(power, CARD_POWER[play.card.rank]);
  }
  return power;
}

/** Follow suit, and play a higher card of that suit when you have one. */
export function legalCards(hand: Card[], trick: Trick | null): Card[] {
  if (!trick || trick.complete || trick.plays.length === 0 || !trick.ledSuit) return hand.slice();
  const follow = hand.filter((c) => c.suit === trick.ledSuit);
  if (follow.length === 0) return hand.slice();
  const beaters = follow.filter((c) => CARD_POWER[c.rank] > ledWinningPower(trick));
  return (beaters.length > 0 ? beaters : follow).slice();
}

const DECLARATION_RANKS: { id: string; rank: Rank; three: string; four: string }[] = [
  { id: 'aces', rank: '1', three: 'Tri asa', four: 'Četiri asa' },
  { id: 'twos', rank: '2', three: 'Tri duje', four: 'Četiri duje' },
  { id: 'threes', rank: '3', three: 'Tri trice', four: 'Četiri trice' },
];

const NAPOLA_SUIT: Record<Suit, string> = {
  cups: 'kupe',
  coins: 'dinari',
  swords: 'špade',
  batons: 'baštuni',
};

/** Three or four aces, twos or threes, and napolitana (ace, two and three of one suit). */
export function findDeclarations(hand: Card[]): DeclarationOffer[] {
  const offers: DeclarationOffer[] = [];
  for (const group of DECLARATION_RANKS) {
    const count = hand.filter((c) => c.rank === group.rank).length;
    if (count >= 4) offers.push({ id: `${group.id}-4`, name: group.four, points: 12 });
    else if (count === 3) offers.push({ id: `${group.id}-3`, name: group.three, points: 9 });
  }
  for (const suit of ['cups', 'coins', 'swords', 'batons'] as Suit[]) {
    const has = (rank: Rank) => hand.some((c) => c.suit === suit && c.rank === rank);
    if (has('1') && has('2') && has('3')) {
      offers.push({ id: `napola-${suit}`, name: `Napolitana (${NAPOLA_SUIT[suit]})`, points: 9 });
    }
  }
  return offers;
}

export function callDeclaration(game: GameState, seat: number, declarationId: string): GameState {
  if (game.phase !== 'playing') throw new Error('Ruka nije u tijeku');
  if (game.trick?.complete) throw new Error('Pričekajte kraj štiha');
  if (game.currentTurnSeat !== seat) throw new Error('Najavu zovete na svom redu');
  const player = game.players.find((p) => p.seat === seat);
  if (!player) throw new Error('Igrač nije pronađen');
  if (player.hand.length < CARDS_PER_PLAYER) throw new Error('Najavu možete zvati samo prije prve karte');
  const offer = findDeclarations(player.hand).find((d) => d.id === declarationId);
  if (!offer) throw new Error('Nemate tu najavu');
  if (game.declarations.some((d) => d.seat === seat && d.id === declarationId)) {
    throw new Error('Najava je već zvana');
  }
  const team = seatToTeam(seat);
  return {
    ...game,
    scores: { ...game.scores, [team]: game.scores[team] + offer.points },
    declarations: [...game.declarations, { ...offer, seat, team }],
  };
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

  const legal = legalCards(player.hand, game.trick);
  if (!legal.some((c) => c.id === card.id)) {
    const led = game.trick?.ledSuit;
    if (led && card.suit === led && hasSuit(player.hand, led)) {
      throw new Error('Morate baciti jaču kartu');
    }
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
    declarations: [],
    callable: undefined,
    lastTrickWinnerSeat: null,
    winnerTeam: null,
    handNumber: game.handNumber + 1,
    dealerSeat,
  };
}

function weakest(cards: Card[]): Card {
  return cards.slice().sort((a, b) => CARD_POWER[a.rank] - CARD_POWER[b.rank])[0];
}

export function botChooseCard(hand: Card[], trick: Trick | null): Card {
  const legal = legalCards(hand, trick);
  if (!trick || trick.plays.length === 0) {
    const junk = legal.filter((c) => CARD_VALUE[c.rank] === 0);
    return weakest(junk.length > 0 ? junk : legal);
  }
  return weakest(legal);
}
