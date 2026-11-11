import { Server as HttpServer } from 'http';
import { Server as IOServer, Socket } from 'socket.io';
import type {
  ServerToClientEvents,
  ClientToServerEvents,
  InterServerEvents,
  SocketData,
  Room,
  Player,
  GameState,
} from './types';
import { nextSeat } from './types';
import {
  createPlayer,
  newGameState,
  startHand,
  playCard,
  advanceAfterTrick,
  botChooseCard,
  findCard,
} from './game';

const rooms = new Map<string, Room>();
const botTimers = new Map<string, ReturnType<typeof setTimeout>>();
const trickTimers = new Map<string, ReturnType<typeof setTimeout>>();
const handTimers = new Map<string, ReturnType<typeof setTimeout>>();

const BOT_DELAY_MS = 700;
const TRICK_PAUSE_MS = 1100;
const HAND_PAUSE_MS = 2800;

type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

function emptyRoomSlot(seat: number): Player {
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

function createRoom(roomId: string, name: string): Room {
  return {
    id: roomId,
    name,
    players: [0, 1, 2, 3].map((seat) => emptyRoomSlot(seat)),
    game: null,
    createdAt: Date.now(),
  };
}

function getRoom(roomId: string): Room | undefined {
  return rooms.get(roomId);
}

function clearTimer(map: Map<string, ReturnType<typeof setTimeout>>, roomId: string) {
  const timer = map.get(roomId);
  if (timer) clearTimeout(timer);
  map.delete(roomId);
}

function clearTimers(roomId: string) {
  clearTimer(botTimers, roomId);
  clearTimer(trickTimers, roomId);
  clearTimer(handTimers, roomId);
}

function publicRoom(room: Room): Room {
  return {
    ...room,
    game: null,
    players: room.players.map((p) => ({ ...p, hand: [], cardCount: p.hand.length })),
  };
}

function redactGame(game: GameState, viewerId: string | null): GameState {
  return {
    ...game,
    players: game.players.map((p) => ({
      ...p,
      hand: p.id === viewerId ? p.hand : [],
      cardCount: p.hand.length,
    })),
  };
}

function pushState(io: IOServer, room: Room) {
  const ids = io.sockets.adapter.rooms.get(room.id);
  if (!ids) return;
  const pub = publicRoom(room);
  for (const id of ids) {
    const sock = io.sockets.sockets.get(id);
    if (!sock) continue;
    sock.emit('room-state', { room: pub });
    if (room.game) sock.emit('game-state', { game: redactGame(room.game, sock.data.playerId) });
  }
}

function firstOpenSeat(room: Room): number {
  const empty = room.players.find((p) => !p.id && !p.isBot);
  if (empty) return empty.seat;
  const bot = room.players.find((p) => p.isBot);
  if (bot) return bot.seat;
  return -1;
}

function seatPlayer(room: Room, player: Player): { room: Room; player: Player } | null {
  const seat = firstOpenSeat(room);
  if (seat === -1) return null;
  const seated: Player = { ...player, seat, connected: true, isBot: false, hand: [] };
  const players = room.players.map((p) => (p.seat === seat ? seated : p));
  const game = room.game
    ? {
        ...room.game,
        players: room.game.players.map((p) =>
          p.seat === seat
            ? {
                ...p,
                id: seated.id,
                name: seated.name,
                icon: seated.icon,
                isBot: false,
                connected: true,
              }
            : p,
        ),
      }
    : room.game;
  return { room: { ...room, players, game }, player: seated };
}

function rosterForHand(room: Room): Player[] {
  const source = room.game?.players ?? room.players;
  return source.map((gp) => {
    const roomPlayer = room.players.find((p) => p.seat === gp.seat);
    return {
      ...(roomPlayer ?? gp),
      id: roomPlayer?.id || gp.id,
      name: roomPlayer?.name || gp.name,
      icon: roomPlayer?.icon || gp.icon,
      isBot: roomPlayer?.isBot ?? gp.isBot,
      connected: roomPlayer?.connected ?? gp.connected,
      seat: gp.seat,
      hand: [],
    };
  });
}

function beginNextHand(io: IOServer, roomId: string) {
  clearTimer(handTimers, roomId);
  const live = getRoom(roomId);
  if (!live?.game || live.game.phase !== 'hand-over') return;
  const dealer = nextSeat(live.game.dealerSeat);
  const roster = rosterForHand(live);
  const game = startHand(live.game, roster, dealer);
  const updated: Room = {
    ...live,
    players: roster.map((p) => ({ ...p, hand: [] })),
    game,
  };
  rooms.set(updated.id, updated);
  pushState(io, updated);
  maybeBotTurn(io, updated);
}

function scheduleNextHand(io: IOServer, roomId: string) {
  clearTimer(handTimers, roomId);
  const timer = setTimeout(() => beginNextHand(io, roomId), HAND_PAUSE_MS);
  handTimers.set(roomId, timer);
}

function scheduleTrickResolution(io: IOServer, roomId: string) {
  clearTimer(trickTimers, roomId);
  const timer = setTimeout(() => {
    trickTimers.delete(roomId);
    const live = getRoom(roomId);
    if (!live?.game?.trick?.complete) return;
    const game = advanceAfterTrick(live.game);
    const updated: Room = { ...live, game };
    rooms.set(updated.id, updated);
    pushState(io, updated);
    if (game.phase === 'playing') maybeBotTurn(io, updated);
    else if (game.phase === 'hand-over') scheduleNextHand(io, roomId);
  }, TRICK_PAUSE_MS);
  trickTimers.set(roomId, timer);
}

function maybeBotTurn(io: IOServer, room: Room) {
  clearTimer(botTimers, room.id);
  const game = room.game;
  if (!game || game.phase !== 'playing' || game.trick?.complete) return;
  const seat = game.currentTurnSeat;
  if (seat === null) return;
  const player = game.players.find((p) => p.seat === seat);
  if (!player?.isBot) return;

  const timer = setTimeout(() => {
    botTimers.delete(room.id);
    const live = getRoom(room.id);
    if (!live?.game || live.game.phase !== 'playing' || live.game.trick?.complete) return;
    if (live.game.currentTurnSeat !== seat) return;
    const bot = live.game.players.find((p) => p.seat === seat);
    if (!bot?.isBot || bot.hand.length === 0) return;
    const card = botChooseCard(bot.hand, live.game.trick?.ledSuit ?? null, live.game.trick, seat);
    try {
      const { game: next, trickComplete } = playCard(live.game, seat, card);
      const updated: Room = { ...live, game: next };
      rooms.set(updated.id, updated);
      pushState(io, updated);
      if (trickComplete) scheduleTrickResolution(io, updated.id);
      else maybeBotTurn(io, updated);
    } catch (err) {
      console.error('bot error', err);
    }
  }, BOT_DELAY_MS);
  botTimers.set(room.id, timer);
}

function detach(io: IOServer, socket: GameSocket) {
  const roomId = socket.data.roomId;
  const playerId = socket.data.playerId;
  socket.data.roomId = null;
  socket.data.playerId = null;
  if (!roomId || !playerId) return;
  socket.leave(roomId);

  const room = getRoom(roomId);
  if (!room) return;
  const player = room.players.find((p) => p.id === playerId);
  if (!player || player.isBot) return;

  const others = room.players.some((p) => p.id && p.id !== playerId && !p.isBot);
  if (!others) {
    clearTimers(roomId);
    rooms.delete(roomId);
    return;
  }

  const inGame = !!room.game && room.game.phase !== 'game-over';
  let next: Room;
  if (inGame && room.game) {
    const botName = `Bot ${player.seat + 1}`;
    next = {
      ...room,
      players: room.players.map((p) =>
        p.id === playerId ? { ...p, isBot: true, connected: true, name: botName, icon: '🤖' } : p,
      ),
      game: {
        ...room.game,
        players: room.game.players.map((p) =>
          p.id === playerId ? { ...p, isBot: true, connected: true, name: botName, icon: '🤖' } : p,
        ),
      },
    };
  } else {
    next = {
      ...room,
      players: room.players.map((p) => (p.seat === player.seat ? emptyRoomSlot(p.seat) : p)),
    };
  }
  rooms.set(next.id, next);
  pushState(io, next);
  if (next.game) maybeBotTurn(io, next);
}

export function setupSocketIo(httpServer: HttpServer): IOServer {
  const io = new IOServer<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>(
    httpServer,
    { cors: { origin: '*', methods: ['GET', 'POST'] } },
  );

  io.use((socket, next) => {
    socket.data.playerId = null;
    socket.data.roomId = null;
    next();
  });

  io.on('connection', (socket) => {
    socket.on('list-rooms', (cb) => {
      cb(
        [...rooms.values()].map((room) => ({
          id: room.id,
          name: room.name,
          seated: room.players.filter((p) => p.id || p.isBot).length,
          humans: room.players.filter((p) => p.id && !p.isBot).length,
          bots: room.players.filter((p) => p.isBot).length,
          started: !!room.game && room.game.phase !== 'game-over',
        })),
      );
    });

    socket.on('join-room', ({ name, icon, roomId, roomName }, cb) => {
      try {
        if (socket.data.roomId && socket.data.playerId) detach(io, socket);

        const requested = (roomId || '').trim();
        let room = requested ? getRoom(requested) : undefined;
        if (requested && !room) {
          cb({ ok: false, error: 'Soba ne postoji' });
          return;
        }
        if (!room) {
          const id = `room-${Math.random().toString(36).slice(2, 8)}`;
          const label = (roomName || name || 'Stol').trim().slice(0, 40) || 'Stol';
          room = createRoom(id, label);
          rooms.set(id, room);
        }

        const player = createPlayer({
          id: `p-${Math.random().toString(36).slice(2, 10)}`,
          name: (name || 'Gost').trim().slice(0, 24) || 'Gost',
          icon: icon || '🃏',
          seat: -1,
          isBot: false,
          connected: true,
        });
        const seated = seatPlayer(room, player);
        if (!seated) {
          cb({ ok: false, error: 'Soba je puna' });
          return;
        }

        rooms.set(seated.room.id, seated.room);
        socket.data.playerId = seated.player.id;
        socket.data.roomId = seated.room.id;
        socket.join(seated.room.id);

        const game = seated.room.game ? redactGame(seated.room.game, seated.player.id) : null;
        cb({ ok: true, player: seated.player, room: publicRoom(seated.room), game });
        pushState(io, seated.room);
        clearTimer(botTimers, seated.room.id);
        if (seated.room.game) maybeBotTurn(io, seated.room);
      } catch (err) {
        cb({ ok: false, error: (err as Error).message });
      }
    });

    socket.on('leave-room', () => {
      detach(io, socket);
    });

    socket.on('rename-room', ({ roomId, name }) => {
      if (socket.data.roomId !== roomId) return;
      const room = getRoom(roomId);
      if (!room) return;
      const next = { ...room, name: name.trim().slice(0, 40) || room.name };
      rooms.set(next.id, next);
      pushState(io, next);
    });

    socket.on('toggle-bot', ({ roomId, seat, isBot }) => {
      if (socket.data.roomId !== roomId) return;
      const room = getRoom(roomId);
      if (!room || (room.game && room.game.phase !== 'game-over')) return;
      const target = room.players.find((p) => p.seat === seat);
      if (!target || (target.id && !target.isBot)) return;

      const players = room.players.map((p) => {
        if (p.seat !== seat) return p;
        if (!isBot) return emptyRoomSlot(seat);
        return createPlayer({
          id: `bot-${seat}-${Math.random().toString(36).slice(2, 6)}`,
          name: `Bot ${seat + 1}`,
          icon: '🤖',
          seat,
          isBot: true,
          connected: true,
        });
      });
      const updated = { ...room, players };
      rooms.set(updated.id, updated);
      pushState(io, updated);
    });

    socket.on('start-game', ({ roomId, playerId }, cb) => {
      if (socket.data.roomId !== roomId || !socket.data.playerId || socket.data.playerId !== playerId) {
        cb?.({ ok: false, error: 'Niste u toj sobi' });
        return;
      }
      const room = getRoom(roomId);
      if (!room) {
        cb?.({ ok: false, error: 'Soba nije pronađena' });
        return;
      }
      if (room.game && (room.game.phase === 'playing' || room.game.phase === 'hand-over')) {
        cb?.({ ok: false, error: 'Igra je već u tijeku' });
        return;
      }

      const players = room.players.map((p) => {
        if (p.id && !p.isBot) return { ...p, hand: [], connected: true };
        return createPlayer({
          id: `bot-${p.seat}-${Math.random().toString(36).slice(2, 6)}`,
          name: `Bot ${p.seat + 1}`,
          icon: '🤖',
          seat: p.seat,
          isBot: true,
          connected: true,
        });
      });

      const humans = players.filter((p) => !p.isBot);
      const dealerSeat = humans.length === 1
        ? (humans[0].seat + 3) % 4
        : Math.floor(Math.random() * 4);

      try {
        const game = startHand(newGameState(dealerSeat), players, dealerSeat);
        const updated: Room = {
          ...room,
          players: players.map((p) => ({ ...p, hand: [] })),
          game,
        };
        rooms.set(updated.id, updated);
        pushState(io, updated);
        maybeBotTurn(io, updated);
        cb?.({ ok: true });
      } catch (err) {
        cb?.({ ok: false, error: (err as Error).message });
      }
    });

    socket.on('play-card', ({ roomId, cardId }, cb) => {
      const fail = (error: string) => {
        cb?.({ ok: false, error });
        socket.emit('error', { message: error });
      };
      if (socket.data.roomId !== roomId || !socket.data.playerId) {
        fail('Niste u toj sobi');
        return;
      }
      const room = getRoom(roomId);
      if (!room?.game) {
        fail('Igra nije pokrenuta');
        return;
      }
      const playerId = socket.data.playerId;
      const gamePlayer = room.game.players.find((p) => p.id === playerId);
      if (!gamePlayer) {
        fail('Igrač nije u igri');
        return;
      }
      if (room.game.phase !== 'playing') {
        fail('Ruka je gotova');
        return;
      }
      if (room.game.trick?.complete) {
        fail('Pričekajte kraj štiha');
        return;
      }
      if (room.game.currentTurnSeat !== gamePlayer.seat) {
        fail('Niste na redu');
        return;
      }
      const card = findCard(gamePlayer.hand, cardId);
      if (!card) {
        fail('Karta nije u ruci');
        return;
      }
      try {
        const { game, trickComplete } = playCard(room.game, gamePlayer.seat, card);
        const updated: Room = { ...room, game };
        rooms.set(updated.id, updated);
        pushState(io, updated);
        cb?.({ ok: true });
        if (trickComplete) scheduleTrickResolution(io, room.id);
        else maybeBotTurn(io, updated);
      } catch (err) {
        fail((err as Error).message);
      }
    });

    socket.on('next-hand', () => {
      const roomId = socket.data.roomId;
      if (!roomId) return;
      beginNextHand(io, roomId);
    });

    socket.on('disconnect', () => {
      detach(io, socket);
    });
  });

  return io;
}
