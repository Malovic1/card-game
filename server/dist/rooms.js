"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupSocketIo = setupSocketIo;
const socket_io_1 = require("socket.io");
const game_1 = require("./game");
const rooms = new Map();
function emptyRoomSlot(seat) {
    return {
        id: '',
        name: '',
        icon: '',
        seat,
        isBot: false,
        hand: [],
        connected: false,
    };
}
function createRoom(roomId, name) {
    const players = [0, 1, 2, 3].map((s) => emptyRoomSlot(s));
    return {
        id: roomId,
        name,
        players,
        game: null,
        createdAt: Date.now(),
    };
}
function getRoom(roomId) {
    return rooms.get(roomId);
}
function addPlayerToRoom(room, player) {
    const emptySeat = room.players.findIndex((p) => p.id === '' && !p.isBot);
    if (emptySeat === -1) {
        const botSeat = room.players.findIndex((p) => p.isBot && !p.connected);
        if (botSeat === -1)
            return null;
        player.seat = botSeat;
    }
    else {
        player.seat = emptySeat;
    }
    player.connected = true;
    const nextPlayers = room.players.map((p) => p.seat === player.seat ? player : p);
    return { ...room, players: nextPlayers };
}
function setBot(room, seat, isBot) {
    const nextPlayers = room.players.map((p) => {
        if (p.seat === seat) {
            return { ...p, isBot };
        }
        return p;
    });
    return { ...room, players: nextPlayers };
}
function removePlayer(room, seat) {
    const nextPlayers = room.players.map((p) => p.seat === seat
        ? { ...p, id: '', name: '', icon: '', hand: [], connected: false, isBot: false }
        : p);
    return { ...room, players: nextPlayers, game: null };
}
function broadcast(io, roomId, event, payload) {
    io.to(roomId).emit(event, payload);
}
function roomFull(room) {
    return room.players.every((p) => p.id !== '' || p.isBot);
}
function setupSocketIo(httpServer) {
    const io = new socket_io_1.Server(httpServer, {
        cors: { origin: '*', methods: ['GET', 'POST'] },
    });
    io.use((socket, next) => {
        socket.data.playerId = null;
        socket.data.roomId = null;
        next();
    });
    io.on('connection', (socket) => {
        console.log('client connected', socket.id);
        socket.on('join-room', ({ name, icon, roomId, bot }, cb) => {
            try {
                let room = getRoom(roomId ?? '');
                let isCreator = false;
                if (!room) {
                    const id = roomId || `room-${Math.random().toString(36).slice(2, 8)}`;
                    room = createRoom(id, name || 'Room');
                    rooms.set(id, room);
                    isCreator = true;
                }
                const playerId = `p-${Math.random().toString(36).slice(2, 10)}`;
                const player = (0, game_1.createPlayer)({
                    id: playerId,
                    name: (name || 'Guest').trim(),
                    icon: icon || '🃏',
                    seat: -1,
                    isBot: !!bot,
                });
                const updated = addPlayerToRoom(room, player);
                if (!updated) {
                    cb({ ok: false, error: 'Room is full' });
                    return;
                }
                rooms.set(updated.id, updated);
                room = updated;
                socket.data.playerId = playerId;
                socket.data.roomId = room.id;
                socket.join(room.id);
                cb({ ok: true, player, room });
                socket.emit('joined', { player, room });
                broadcast(io, room.id, 'player-joined', { player });
                broadcast(io, room.id, 'room-state', { room });
            }
            catch (err) {
                cb({ ok: false, error: err.message });
            }
        });
        socket.on('toggle-bot', ({ roomId, seat, isBot }) => {
            const room = getRoom(roomId);
            if (!room)
                return;
            const updated = setBot(room, seat, isBot);
            rooms.set(updated.id, updated);
            broadcast(io, roomId, 'room-state', { room: updated });
            if (updated.game && updated.game.phase === 'playing') {
                maybeBotTurn(io, updated);
            }
        });
        socket.on('ready', ({ roomId, playerId }) => {
            const room = getRoom(roomId);
            if (!room)
                return;
            const player = room.players.find((p) => p.id === playerId);
            if (player) {
                const nextPlayers = room.players.map((p) => p.id === playerId ? { ...p, connected: true } : p);
                const updated = { ...room, players: nextPlayers };
                rooms.set(updated.id, updated);
                broadcast(io, roomId, 'room-state', { room: updated });
            }
        });
        socket.on('start-game', ({ roomId, playerId }) => {
            const room = getRoom(roomId);
            if (!room)
                return;
            const requester = room.players.find((p) => p.id === playerId);
            if (!requester)
                return;
            let current = room;
            const updatedPlayers = current.players.map((p) => {
                if (p.id === '' && !p.isBot) {
                    return (0, game_1.createPlayer)({
                        id: `bot-${p.seat}-${Math.random().toString(36).slice(2, 6)}`,
                        name: `Bot ${p.seat + 1}`,
                        icon: '🤖',
                        seat: p.seat,
                        isBot: true,
                        connected: true,
                    });
                }
                return p;
            });
            current = { ...current, players: updatedPlayers };
            rooms.set(current.id, current);
            const dealerSeat = current.players.findIndex((p) => !p.isBot && p.connected);
            const game = (0, game_1.newGameState)(dealerSeat === -1 ? 0 : dealerSeat);
            game.players = current.players;
            const startedGame = (0, game_1.startHand)(game, current.players, game.dealerSeat);
            current.game = startedGame;
            rooms.set(current.id, current);
            broadcast(io, current.id, 'game-started', { game: startedGame });
            broadcast(io, current.id, 'room-state', { room: current });
            if (startedGame.currentTurnSeat !== null) {
                maybeBotTurn(io, current);
            }
        });
        socket.on('play-card', ({ roomId, playerId, cardId }) => {
            const room = getRoom(roomId);
            if (!room || !room.game)
                return;
            const player = room.players.find((p) => p.id === playerId);
            if (!player)
                return;
            if (room.game.phase !== 'playing')
                return;
            if (room.game.currentTurnSeat !== player.seat)
                return;
            const card = (0, game_1.findCard)(gamePlayerHand(playerId, room.game), cardId);
            if (!card)
                return;
            try {
                const { game, trickComplete } = (0, game_1.playCard)(room.game, player.seat, card);
                room.game = game;
                rooms.set(room.id, room);
                broadcast(io, room.id, 'card-played', { seat: player.seat, card });
                if (trickComplete) {
                    const lastTrick = game.completedTricks[game.completedTricks.length - 1];
                    broadcast(io, room.id, 'trick-complete', {
                        winnerSeat: lastTrick.winnerSeat,
                        cards: lastTrick.cards.map((c) => ({ seat: player.seat, card: c })),
                        game,
                    });
                    if (game.phase === 'hand-over') {
                        broadcast(io, room.id, 'hand-over', { game });
                        if (game.winnerTeam !== null) {
                            broadcast(io, room.id, 'game-over', { game });
                        }
                        else {
                            setTimeout(() => {
                                const r = getRoom(roomId);
                                if (!r || !r.game)
                                    return;
                                const g = (0, game_1.startHand)(r.game, r.players, r.game.dealerSeat);
                                r.game = g;
                                rooms.set(r.id, r);
                                broadcast(io, r.id, 'game-started', { game: g });
                                if (g.currentTurnSeat !== null)
                                    maybeBotTurn(io, r);
                            }, 2500);
                        }
                    }
                    else {
                        broadcast(io, room.id, 'turn-changed', {
                            seat: game.currentTurnSeat,
                            player: game.players.find((p) => p.seat === game.currentTurnSeat) ?? null,
                        });
                        maybeBotTurn(io, room);
                    }
                }
                else {
                    broadcast(io, room.id, 'turn-changed', {
                        seat: game.currentTurnSeat,
                        player: game.players.find((p) => p.seat === game.currentTurnSeat) ?? null,
                    });
                    maybeBotTurn(io, room);
                }
            }
            catch (err) {
                socket.emit('error', { message: err.message });
            }
        });
        socket.on('next-hand', ({ roomId, playerId }) => {
            const room = getRoom(roomId);
            if (!room || !room.game)
                return;
            if (room.game.phase !== 'hand-over')
                return;
            const g = (0, game_1.startHand)(room.game, room.players, room.game.dealerSeat);
            room.game = g;
            rooms.set(room.id, room);
            broadcast(io, room.id, 'game-started', { game: g });
            if (g.currentTurnSeat !== null)
                maybeBotTurn(io, room);
        });
        socket.on('disconnect', () => {
            const roomId = socket.data.roomId;
            const playerId = socket.data.playerId;
            if (!roomId || !playerId)
                return;
            const room = getRoom(roomId);
            if (!room)
                return;
            const player = room.players.find((p) => p.id === playerId);
            if (player) {
                player.connected = false;
                if (!player.isBot) {
                    broadcast(io, roomId, 'player-left', { seat: player.seat });
                    broadcast(io, roomId, 'room-state', { room });
                }
            }
        });
    });
    return io;
}
function gamePlayerHand(playerId, game) {
    if (!game)
        return [];
    const p = game.players.find((x) => x.id === playerId);
    return p ? p.hand : [];
}
function fillBots(io, room) {
    const updatedPlayers = room.players.map((p, i) => p.id === ''
        ? (0, game_1.createPlayer)({
            id: `bot-${i}`,
            name: `Bot ${i + 1}`,
            icon: '🤖',
            seat: i,
            isBot: true,
            connected: true,
        })
        : p);
    const updated = { ...room, players: updatedPlayers };
    rooms.set(updated.id, updated);
    broadcast(io, updated.id, 'room-state', { room: updated });
}
function maybeBotTurn(io, room) {
    if (!room.game)
        return;
    if (room.game.phase !== 'playing')
        return;
    const seat = room.game.currentTurnSeat;
    if (seat === null)
        return;
    const player = room.players.find((p) => p.seat === seat);
    if (!player || !player.isBot)
        return;
    const ledSuit = room.game.trick?.ledSuit ?? null;
    const gameBot = room.game.players.find((p) => p.seat === seat);
    const hand = gameBot ? gameBot.hand : player.hand;
    const card = (0, game_1.botChooseCard)(hand, ledSuit);
    setTimeout(() => {
        const r = getRoom(room.id);
        if (!r || !r.game)
            return;
        if (r.game.currentTurnSeat !== seat || r.game.phase !== 'playing')
            return;
        try {
            const { game, trickComplete } = (0, game_1.playCard)(r.game, seat, card);
            r.game = game;
            rooms.set(r.id, r);
            broadcast(io, r.id, 'bot-played', { seat, card });
            broadcast(io, r.id, 'card-played', { seat, card });
            if (trickComplete) {
                const lastTrick = game.completedTricks[game.completedTricks.length - 1];
                broadcast(io, r.id, 'trick-complete', {
                    winnerSeat: lastTrick.winnerSeat,
                    cards: lastTrick.cards.map((c) => ({ seat, card: c })),
                    game,
                });
                if (game.phase === 'hand-over') {
                    broadcast(io, r.id, 'hand-over', { game });
                    if (game.winnerTeam !== null) {
                        broadcast(io, r.id, 'game-over', { game });
                    }
                    else {
                        setTimeout(() => {
                            const rr = getRoom(room.id);
                            if (!rr || !rr.game)
                                return;
                            const g = (0, game_1.startHand)(rr.game, rr.players, rr.game.dealerSeat);
                            rr.game = g;
                            rooms.set(rr.id, rr);
                            broadcast(io, rr.id, 'game-started', { game: g });
                            if (g.currentTurnSeat !== null)
                                maybeBotTurn(io, rr);
                        }, 2500);
                    }
                }
                else {
                    broadcast(io, r.id, 'turn-changed', {
                        seat: game.currentTurnSeat,
                        player: game.players.find((p) => p.seat === game.currentTurnSeat) ?? null,
                    });
                    maybeBotTurn(io, r);
                }
            }
            else {
                broadcast(io, r.id, 'turn-changed', {
                    seat: game.currentTurnSeat,
                    player: game.players.find((p) => p.seat === game.currentTurnSeat) ?? null,
                });
                maybeBotTurn(io, r);
            }
        }
        catch (err) {
            console.error('bot error', err);
        }
    }, 800 + Math.random() * 700);
}
