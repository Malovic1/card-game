"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RANK_LABELS = exports.SUIT_LABELS = exports.RANKS = exports.SUITS = exports.PLAYER_COUNT = exports.CARDS_PER_PLAYER = exports.DEFAULT_TARGET_POINTS = exports.POINTS_PER_HAND_TOTAL = exports.LAST_TRICK_BONUS = exports.CARD_VALUE = exports.CARD_POWER = void 0;
exports.seatToTeam = seatToTeam;
exports.isPartner = isPartner;
exports.nextSeat = nextSeat;
exports.prevSeat = prevSeat;
// team 0 = seats 0 & 2, team 1 = seats 1 & 3
function seatToTeam(seat) {
    return seat % 2 === 0 ? 0 : 1;
}
function isPartner(seatA, seatB) {
    return seatToTeam(seatA) === seatToTeam(seatB);
}
function nextSeat(seat) {
    return (seat + 1) % 4;
}
function prevSeat(seat) {
    return (seat + 3) % 4;
}
// Trésette card ranking (high -> low): 3, 2, 1(Ace), K, Q, J, 7, 6, 5, 4
exports.CARD_POWER = {
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
exports.CARD_VALUE = {
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
exports.LAST_TRICK_BONUS = 3;
exports.POINTS_PER_HAND_TOTAL = 35; // 32 card points + 3 last trick
exports.DEFAULT_TARGET_POINTS = 21;
exports.CARDS_PER_PLAYER = 10;
exports.PLAYER_COUNT = 4;
exports.SUITS = ['cups', 'coins', 'swords', 'batons'];
exports.RANKS = [
    '1', '2', '3', '4', '5', '6', '7', 'J', 'Q', 'K',
];
exports.SUIT_LABELS = {
    cups: 'Kupe',
    coins: 'Kovanci',
    swords: 'Mače',
    batons: 'Bate',
};
exports.RANK_LABELS = {
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
