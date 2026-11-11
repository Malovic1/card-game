"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createDeck = createDeck;
exports.shuffle = shuffle;
exports.createPlayer = createPlayer;
exports.newGameState = newGameState;
exports.dealCards = dealCards;
exports.hasSuit = hasSuit;
exports.findCard = findCard;
exports.removeCard = removeCard;
exports.playCard = playCard;
exports.startHand = startHand;
exports.resetMatch = resetMatch;
exports.botChooseCard = botChooseCard;
const types_1 = require("./types");
function createDeck() {
    const cards = [];
    let id = 0;
    for (const suit of ['cups', 'coins', 'swords', 'batons']) {
        for (const rank of [
            '1', '2', '3', '4', '5', '6', '7', 'J', 'Q', 'K',
        ]) {
            cards.push({ id: `c${id++}`, suit, rank });
        }
    }
    return cards;
}
function shuffle(array) {
    const a = array.slice();
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}
function createPlayer({ id, name, icon, seat, isBot = false, connected = !isBot, }) {
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
function newGameState(dealerSeat) {
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
        targetPoints: types_1.DEFAULT_TARGET_POINTS,
        winnerTeam: null,
        handNumber: 1,
    };
}
function dealCards(players) {
    const deck = shuffle(createDeck());
    const hands = [[], [], [], []];
    for (let i = 0; i < deck.length; i++) {
        hands[i % 4].push(deck[i]);
    }
    return hands;
}
function hasSuit(hand, suit) {
    return hand.some((c) => c.suit === suit);
}
function findCard(hand, cardId) {
    return hand.find((c) => c.id === cardId);
}
function removeCard(hand, cardId) {
    return hand.filter((c) => c.id !== cardId);
}
function playCard(game, seat, card) {
    const player = game.players.find((p) => p.seat === seat);
    if (!player)
        throw new Error('Player not found');
    if (game.currentTurnSeat !== seat)
        throw new Error('Not your turn');
    if (!findCard(player.hand, card.id))
        throw new Error('Card not in hand');
    const trick = game.trick;
    const ledSuit = trick?.ledSuit ?? card.suit;
    if (trick && trick.ledSuit && card.suit !== trick.ledSuit && hasSuit(player.hand, trick.ledSuit)) {
        throw new Error('Must follow suit');
    }
    const nextHand = removeCard(player.hand, card.id);
    const nextPlayers = game.players.map((p) => p.seat === seat ? { ...p, hand: nextHand } : p);
    const nextTrick = trick
        ? { ...trick, plays: [...trick.plays, { seat, card }] }
        : {
            plays: [{ seat, card }],
            ledSuit: card.suit,
            winnerSeat: null,
            complete: false,
        };
    let trickComplete = false;
    let nextGame = {
        ...game,
        players: nextPlayers,
        trick: nextTrick,
        currentTurnSeat: (0, types_1.nextSeat)(seat),
    };
    if (nextTrick.plays.length === 4) {
        trickComplete = true;
        const winnerSeat = resolveTrickWinner(nextTrick);
        const trickWinnerTeam = (0, types_1.seatToTeam)(winnerSeat);
        const trickPoints = nextTrick.plays.reduce((sum, { card: c }) => sum + types_1.CARD_VALUE[c.rank], 0);
        const completedTricks = [
            ...game.completedTricks,
            { winnerSeat, cards: nextTrick.plays.map((p) => p.card) },
        ];
        const handPoints = { ...game.handPoints };
        handPoints[trickWinnerTeam] += trickPoints;
        let phase = 'playing';
        let currentTurnSeat = winnerSeat;
        let lastTrickWinnerSeat = game.lastTrickWinnerSeat;
        let winnerTeam = game.winnerTeam;
        if (completedTricks.length === 4) {
            handPoints[trickWinnerTeam] += types_1.LAST_TRICK_BONUS;
            lastTrickWinnerSeat = winnerSeat;
            phase = 'hand-over';
            currentTurnSeat = null;
            const scores = { ...game.scores };
            scores[0] += handPoints[0];
            scores[1] += handPoints[1];
            if (scores[0] >= game.targetPoints)
                winnerTeam = 0;
            if (scores[1] >= game.targetPoints)
                winnerTeam = 1;
            if (winnerTeam !== null)
                phase = 'game-over';
            nextGame = {
                ...nextGame,
                completedTricks,
                handPoints,
                lastTrickWinnerSeat,
                scores,
                phase,
                currentTurnSeat,
                winnerTeam,
                handNumber: phase === 'game-over' ? game.handNumber : game.handNumber + 1,
            };
        }
        else {
            nextGame = {
                ...nextGame,
                completedTricks,
                handPoints,
                trick: null,
                lastTrickWinnerSeat: winnerSeat,
            };
        }
        return { game: nextGame, trickComplete: true };
    }
    return { game: nextGame, trickComplete: false };
}
function resolveTrickWinner(trick) {
    const ledSuit = trick.ledSuit;
    let best = trick.plays[0];
    for (const play of trick.plays) {
        if (play.card.suit === ledSuit) {
            if (best.card.suit !== ledSuit ||
                types_1.CARD_POWER[play.card.rank] > types_1.CARD_POWER[best.card.rank]) {
                best = play;
            }
        }
    }
    return best.seat;
}
function startHand(game, players, dealerSeat) {
    const hands = dealCards(players);
    const nextPlayers = players.map((p, i) => ({ ...p, hand: hands[i] }));
    const leader = (dealerSeat + 3) % 4;
    return {
        ...game,
        phase: 'playing',
        players: nextPlayers,
        currentTurnSeat: leader,
        trick: null,
        completedTricks: [],
        handPoints: { 0: 0, 1: 0 },
        lastTrickWinnerSeat: null,
        winnerTeam: null,
        handNumber: game.handNumber + 1,
        dealerSeat,
    };
}
function resetMatch(game) {
    return {
        ...game,
        scores: { 0: 0, 1: 0 },
        winnerTeam: null,
        handNumber: 1,
    };
}
function botChooseCard(hand, ledSuit) {
    const sameSuit = ledSuit ? hand.filter((c) => c.suit === ledSuit) : [];
    const candidates = sameSuit.length > 0 ? sameSuit : hand;
    candidates.sort((a, b) => types_1.CARD_POWER[a.rank] - types_1.CARD_POWER[b.rank]);
    return candidates[0];
}
