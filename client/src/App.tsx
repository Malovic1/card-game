import { useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import type { Card, GameState, Player, Room, Suit } from './types';
import { AVATARS, RANK_LABELS, SUIT_LABELS, type RoomSummary } from './types';
import { connect } from './services/socket';
import { cardColor, formatPoints, rankGlyph, sortHand, suitSymbol } from './lib/cards';

type Screen = 'home' | 'rooms' | 'lobby' | 'table';
type Link = 'connecting' | 'online' | 'offline';
type JoinResp = {
  ok: boolean;
  player?: Player;
  room?: Room;
  game?: GameState | null;
  error?: string;
};

function stored(key: string, fallback: string): string {
  try {
    return localStorage.getItem(key) || fallback;
  } catch {
    return fallback;
  }
}

function visualPosition(seat: number, mySeat: number): 'south' | 'east' | 'north' | 'west' {
  const rel = (seat - mySeat + 4) % 4;
  return (['south', 'east', 'north', 'west'] as const)[rel];
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('home');
  const [link, setLink] = useState<Link>('connecting');
  const [name, setName] = useState(() => stored('treseta-name', ''));
  const [icon, setIcon] = useState(() => stored('treseta-icon', '🃏'));
  const [draftName, setDraftName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [roomList, setRoomList] = useState<RoomSummary[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [room, setRoom] = useState<Room | null>(null);
  const [game, setGame] = useState<GameState | null>(null);
  const [myPlayerId, setMyPlayerId] = useState<string | null>(null);
  const [acting, setActing] = useState(false);
  const [busy, setBusy] = useState(false);

  const socketRef = useRef<Socket | null>(null);
  const activeRef = useRef(false);
  const busyRef = useRef(false);
  const actingRef = useRef(false);

  useEffect(() => {
    try {
      localStorage.setItem('treseta-name', name);
      localStorage.setItem('treseta-icon', icon);
    } catch {
      /* ignore private-mode storage failures */
    }
  }, [name, icon]);

  useEffect(() => {
    const sock = connect();
    socketRef.current = sock;

    const onConnect = () => setLink('online');
    const onDisconnect = () => setLink('offline');
    const onConnectError = () => setLink('offline');
    const onRoom = ({ room: next }: { room: Room }) => {
      if (!activeRef.current) return;
      setRoom(next);
    };
    const onGame = ({ game: next }: { game: GameState }) => {
      if (!activeRef.current) return;
      setGame(next);
      setScreen('table');
      setError('');
      busyRef.current = false;
      setBusy(false);
    };
    const onErr = ({ message }: { message: string }) => setError(message);

    sock.on('connect', onConnect);
    sock.on('disconnect', onDisconnect);
    sock.on('connect_error', onConnectError);
    sock.on('room-state', onRoom);
    sock.on('game-state', onGame);
    sock.on('error', onErr);
    setLink(sock.connected ? 'online' : 'connecting');

    return () => {
      sock.off('connect', onConnect);
      sock.off('disconnect', onDisconnect);
      sock.off('connect_error', onConnectError);
      sock.off('room-state', onRoom);
      sock.off('game-state', onGame);
      sock.off('error', onErr);
    };
  }, []);

  useEffect(() => {
    if (screen !== 'rooms') return;
    let stop = false;
    const pull = () => {
      socketRef.current?.emit('list-rooms', (list: RoomSummary[]) => {
        if (!stop) setRoomList(list);
      });
    };
    pull();
    const timer = window.setInterval(pull, 2000);
    return () => {
      stop = true;
      window.clearInterval(timer);
    };
  }, [screen]);

  const roomId = room?.id;
  useEffect(() => {
    if (room?.name) setDraftName(room.name);
  }, [roomId, room?.name]);

  function requireName(): boolean {
    if (name.trim()) return true;
    setError('Unesite ime');
    return false;
  }

  function withSocket(fn: (sock: Socket) => void) {
    const sock = connect();
    socketRef.current = sock;
    if (sock.connected) {
      fn(sock);
      return;
    }
    setLink('connecting');
    const onConnect = () => {
      window.clearTimeout(failTimer);
      setLink('online');
      fn(sock);
    };
    const onFail = () => {
      sock.off('connect', onConnect);
      actingRef.current = false;
      activeRef.current = false;
      setActing(false);
      setLink('offline');
      setError('Nema veze sa serverom. U mapi projekta pokrenite npm run dev.');
    };
    const failTimer = window.setTimeout(onFail, 6000);
    sock.once('connect', onConnect);
  }

  function stopActing() {
    actingRef.current = false;
    setActing(false);
  }

  function takeSeat(resp: JoinResp, sock: Socket, andStart: boolean) {
    if (!resp.ok || !resp.player || !resp.room) {
      activeRef.current = false;
      stopActing();
      setError(resp.error || 'Ne mogu ući u sobu');
      return;
    }
    setMyPlayerId(resp.player.id);
    setRoom(resp.room);
    setDraftName(resp.room.name);
    setError('');
    if (resp.game) {
      setGame(resp.game);
      setScreen('table');
      stopActing();
      return;
    }
    if (!andStart) {
      setScreen('lobby');
      stopActing();
      return;
    }
    sock.emit(
      'start-game',
      { roomId: resp.room.id, playerId: resp.player.id },
      (startResp: { ok: boolean; error?: string }) => {
        stopActing();
        if (!startResp.ok) {
          setError(startResp.error || 'Ne mogu započeti igru');
          setScreen('lobby');
        }
      },
    );
  }

  function quickPlay() {
    if (!requireName() || actingRef.current) return;
    setError('');
    actingRef.current = true;
    setActing(true);
    activeRef.current = true;
    withSocket((sock) => {
      sock.emit(
        'join-room',
        { name: name.trim(), icon, roomName: `Stol ${name.trim()}` },
        (resp: JoinResp) => takeSeat(resp, sock, true),
      );
    });
  }

  function openTable() {
    if (!requireName() || actingRef.current) return;
    setError('');
    actingRef.current = true;
    setActing(true);
    activeRef.current = true;
    withSocket((sock) => {
      sock.emit(
        'join-room',
        { name: name.trim(), icon, roomName: `Stol ${name.trim()}` },
        (resp: JoinResp) => takeSeat(resp, sock, false),
      );
    });
  }

  function joinExisting(id: string) {
    if (!requireName() || actingRef.current) return;
    const code = id.trim();
    if (!code) {
      setError('Unesite kod sobe');
      return;
    }
    setError('');
    actingRef.current = true;
    setActing(true);
    activeRef.current = true;
    withSocket((sock) => {
      sock.emit(
        'join-room',
        { name: name.trim(), icon, roomId: code },
        (resp: JoinResp) => takeSeat(resp, sock, false),
      );
    });
  }

  function leave() {
    activeRef.current = false;
    actingRef.current = false;
    busyRef.current = false;
    socketRef.current?.emit('leave-room');
    setScreen('home');
    setRoom(null);
    setGame(null);
    setMyPlayerId(null);
    setError('');
    setNotice('');
    setBusy(false);
    setActing(false);
  }

  function startGame() {
    if (!room || !myPlayerId) return;
    setError('');
    socketRef.current?.emit(
      'start-game',
      { roomId: room.id, playerId: myPlayerId },
      (resp: { ok: boolean; error?: string }) => {
        if (!resp.ok) setError(resp.error || 'Ne mogu započeti igru');
      },
    );
  }

  function saveRoomName() {
    if (!room) return;
    const next = draftName.trim();
    if (!next || next === room.name) return;
    socketRef.current?.emit('rename-room', { roomId: room.id, name: next });
  }

  function toggleBot(seat: number, isBot: boolean) {
    if (!room) return;
    socketRef.current?.emit('toggle-bot', { roomId: room.id, seat, isBot });
  }

  async function copyCode() {
    if (!room) return;
    try {
      await navigator.clipboard.writeText(room.id);
      setNotice('Kod sobe je kopiran');
    } catch {
      setNotice(room.id);
    }
    window.setTimeout(() => setNotice(''), 2000);
  }

  const mySeat = game?.players.find((p) => p.id === myPlayerId)?.seat
    ?? room?.players.find((p) => p.id === myPlayerId)?.seat
    ?? null;
  const me = game?.players.find((p) => p.id === myPlayerId) ?? null;
  const myTeam: 0 | 1 = mySeat !== null && mySeat % 2 === 1 ? 1 : 0;
  const oppTeam: 0 | 1 = myTeam === 0 ? 1 : 0;

  function canPlay(card: Card): boolean {
    if (!game || !me || mySeat === null) return false;
    if (game.phase !== 'playing' || game.trick?.complete) return false;
    if (game.currentTurnSeat !== mySeat) return false;
    if (busyRef.current) return false;
    const led = game.trick?.ledSuit ?? null;
    if (led && me.hand.some((c) => c.suit === led) && card.suit !== led) return false;
    return true;
  }

  function playCard(card: Card) {
    if (!room || !game || busyRef.current) return;
    if (!canPlay(card)) {
      if (game.currentTurnSeat !== mySeat) setError('Niste na redu');
      else setError('Morate odgovoriti u boji');
      return;
    }
    const sock = socketRef.current;
    if (!sock) return;
    busyRef.current = true;
    setBusy(true);
    setError('');
    const timer = window.setTimeout(() => {
      busyRef.current = false;
      setBusy(false);
      setError('Nema odgovora od servera');
    }, 4000);
    sock.emit('play-card', { roomId: room.id, cardId: card.id }, (resp: { ok: boolean; error?: string }) => {
      window.clearTimeout(timer);
      busyRef.current = false;
      setBusy(false);
      if (!resp?.ok) setError(resp?.error || 'Ne mogu baciti kartu');
    });
  }

  const linkLabel = link === 'online' ? 'Spojeno' : link === 'offline' ? 'Nema veze sa serverom' : 'Spajanje…';

  return (
    <div className={`page ${screen === 'table' ? 'table-page' : ''}`}>
      {screen === 'home' && (
        <form
          className="home"
          onSubmit={(e) => {
            e.preventDefault();
            quickPlay();
          }}
        >
          <h1>Trešeta</h1>
          <p className="hint">Četiri igrača, dva para. Odgovorite u boju. Jači su 3, 2, as, kralj, konj, špic. Igra se do 21.</p>
          {error && <div className="error">{error}</div>}
          <input
            className="input"
            placeholder="Vaše ime"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={24}
            autoFocus
          />
          <div className="avatars">
            {AVATARS.map((av) => (
              <button
                key={av}
                type="button"
                className={`avatar ${icon === av ? 'selected' : ''}`}
                onClick={() => setIcon(av)}
              >
                {av}
              </button>
            ))}
          </div>
          <button className="btn" type="submit" disabled={acting}>
            {acting ? 'Otvaram stol…' : 'Igraj protiv botova'}
          </button>
          <div className="row">
            <button className="btn secondary" type="button" onClick={openTable} disabled={acting}>
              Stol za prijatelje
            </button>
            <button className="btn secondary" type="button" onClick={() => { setError(''); setScreen('rooms'); }} disabled={acting}>
              Otvori sobe
            </button>
          </div>
          <p className={`hint ${link === 'offline' ? 'error' : ''}`}>{linkLabel}</p>
        </form>
      )}

      {screen === 'rooms' && (
        <div className="home">
          <div className="row spread">
            <h1>Sobe</h1>
            <button className="btn secondary" type="button" onClick={() => { setError(''); setScreen('home'); }}>Natrag</button>
          </div>
          {error && <div className="error">{error}</div>}
          <div className="row">
            <input
              className="input"
              placeholder="Kod sobe"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') joinExisting(joinCode); }}
            />
            <button className="btn" type="button" onClick={() => joinExisting(joinCode)} disabled={acting}>
              Uđi
            </button>
          </div>
          <div className="room-list">
            {roomList.length === 0 && <p className="empty">Nema otvorenih stolova. Otvorite svoj.</p>}
            {roomList.map((item) => {
              const full = item.humans >= 4;
              return (
                <div key={item.id} className="room-item">
                  <div>
                    <strong>{item.name}</strong>
                    <div className="hint">{item.id} · {item.humans}/4 igrača{item.started ? ' · igra traje' : ''}</div>
                  </div>
                  <button className="btn" type="button" disabled={full || acting} onClick={() => joinExisting(item.id)}>
                    {full ? 'Puno' : 'Uđi'}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {screen === 'lobby' && room && (
        <div className="home wide">
          <div className="row spread">
            <h1>Stol</h1>
            <button className="btn secondary" type="button" onClick={leave}>Izađi</button>
          </div>
          {error && <div className="error">{error}</div>}
          {notice && <div className="notice">{notice}</div>}
          <div className="row">
            <input className="input" value={draftName} onChange={(e) => setDraftName(e.target.value)} maxLength={40} />
            <button className="btn secondary" type="button" onClick={saveRoomName}>Spremi</button>
          </div>
          <button className="code" type="button" onClick={copyCode}>
            Kod: {room.id}
          </button>
          <div className="roster">
            {room.players.map((p) => (
              <div key={p.seat} className="roster-seat">
                <div className="avatar">{p.icon || '·'}</div>
                <div className="name">
                  {p.id ? p.name : 'Prazno'}
                  {p.isBot && ' · bot'}
                  {p.id === myPlayerId && ' · vi'}
                </div>
                {!p.id && (
                  <button className="btn secondary" type="button" onClick={() => toggleBot(p.seat, true)}>Dodaj bota</button>
                )}
                {p.isBot && (
                  <button className="btn secondary" type="button" onClick={() => toggleBot(p.seat, false)}>Makni bota</button>
                )}
              </div>
            ))}
          </div>
          <button className="btn" type="button" onClick={startGame}>Započni igru</button>
          <p className="hint">Prazna mjesta postaju botovi. Partner vam je nasuprot. Dijeli se na desno.</p>
        </div>
      )}

      {screen === 'table' && room && game && mySeat !== null && (
        <Table
          room={room}
          game={game}
          me={me}
          mySeat={mySeat}
          myTeam={myTeam}
          oppTeam={oppTeam}
          error={error}
          busy={busy}
          canPlay={canPlay}
          onPlay={playCard}
          onLeave={leave}
          onNext={() => socketRef.current?.emit('next-hand')}
          onAgain={() => { leave(); quickPlay(); }}
        />
      )}
    </div>
  );
}

function Table({
  room,
  game,
  me,
  mySeat,
  myTeam,
  oppTeam,
  error,
  busy,
  canPlay,
  onPlay,
  onLeave,
  onNext,
  onAgain,
}: {
  room: Room;
  game: GameState;
  me: Player | null;
  mySeat: number;
  myTeam: 0 | 1;
  oppTeam: 0 | 1;
  error: string;
  busy: boolean;
  canPlay: (card: Card) => boolean;
  onPlay: (card: Card) => void;
  onLeave: () => void;
  onNext: () => void;
  onAgain: () => void;
}) {
  const myTurn = game.phase === 'playing' && !game.trick?.complete && game.currentTurnSeat === mySeat;
  const led: Suit | null = game.trick && !game.trick.complete ? game.trick.ledSuit : null;
  const trickNo = Math.min(
    10,
    game.completedTricks.length + (game.phase === 'playing' ? 1 : 0),
  );
  const turnName = game.players.find((p) => p.seat === game.currentTurnSeat)?.name;
  const winnerName = game.players.find((p) => p.seat === game.trick?.winnerSeat)?.name;
  const sorted = sortHand(me?.hand ?? []);

  let status = '';
  if (game.phase === 'game-over') {
    status = game.winnerTeam === myTeam ? 'Pobijedili ste' : 'Izgubili ste';
  } else if (game.phase === 'hand-over') {
    status = `Ruka gotova · Mi ${formatPoints(game.handPoints[myTeam])} : ${formatPoints(game.handPoints[oppTeam])} Oni`;
  } else if (game.trick?.complete) {
    status = `Štih nosi ${winnerName ?? ''}`;
  } else if (myTurn) {
    status = led && me?.hand.some((c) => c.suit === led)
      ? `Vi ste na redu · ${SUIT_LABELS[led]}`
      : 'Vi ste na redu';
  } else if (turnName) {
    status = `Na redu: ${turnName}`;
  }

  return (
    <>
      <header className="topbar">
        <div>
          <strong>{room.name}</strong>
          <div className="hint">{room.id}</div>
        </div>
        <div className="scoreboard">
          <div className={`score ${game.winnerTeam === myTeam ? 'win' : ''}`}>
            <span>Mi</span>
            <strong>{formatPoints(game.scores[myTeam])}</strong>
          </div>
          <div className="score mid">
            <span>do {formatPoints(game.targetPoints)}</span>
            <small>Štih {trickNo}/10 · ruka {formatPoints(game.handPoints[myTeam])} : {formatPoints(game.handPoints[oppTeam])}</small>
          </div>
          <div className={`score ${game.winnerTeam === oppTeam ? 'win' : ''}`}>
            <span>Oni</span>
            <strong>{formatPoints(game.scores[oppTeam])}</strong>
          </div>
        </div>
        <button className="btn secondary" type="button" onClick={onLeave}>Izađi</button>
      </header>

      {error && <div className="error banner">{error}</div>}
      <div className={`status ${myTurn ? 'mine' : ''}`}>{status}</div>

      <div className="felt">
        {game.players.map((p) => {
          const pos = visualPosition(p.seat, mySeat);
          const count = p.id === me?.id ? p.hand.length : (p.cardCount ?? p.hand.length);
          const active = p.seat === game.currentTurnSeat;
          const partner = pos === 'north';
          return (
            <div key={p.seat} className={`seat ${pos} ${active ? 'active' : ''}`}>
              <div className="avatar">{p.icon}</div>
              <div className="name">{p.id === me?.id ? 'Vi' : p.name}</div>
              {partner && <div className="tag">partner</div>}
              {pos !== 'south' && count > 0 && (
                <div className="pile" aria-label={`${count} karata`}>
                  <div className="card back mini" />
                  <span>{count}</span>
                </div>
              )}
            </div>
          );
        })}
        <div className="trick-area">
          {game.trick?.plays.map((play) => (
            <div
              key={`${play.seat}-${play.card.id}`}
              className={`played ${visualPosition(play.seat, mySeat)} ${game.trick?.complete && game.trick.winnerSeat === play.seat ? 'won' : ''}`}
            >
              <div className="rank" style={{ color: cardColor(play.card.suit) }}>{rankGlyph(play.card.rank)}</div>
              <div className="suit">{suitSymbol(play.card.suit)}</div>
            </div>
          ))}
        </div>
      </div>

      <div className={`my-hand ${myTurn ? 'live' : ''} ${busy ? 'busy' : ''}`}>
        {sorted.map((card, index) => {
          const legal = canPlay(card);
          const gap = index > 0 && sorted[index - 1].suit !== card.suit;
          return (
            <button
              key={card.id}
              type="button"
              className={`card ${gap ? 'gap' : ''} ${myTurn ? (legal ? 'legal' : 'illegal') : 'wait'}`}
              onClick={() => onPlay(card)}
              title={`${RANK_LABELS[card.rank]} · ${SUIT_LABELS[card.suit]}`}
            >
              <div className="rank" style={{ color: cardColor(card.suit) }}>{rankGlyph(card.rank)}</div>
              <div className="suit">{suitSymbol(card.suit)}</div>
            </button>
          );
        })}
      </div>

      {game.phase === 'hand-over' && (
        <div className="result">
          <h2>Ruka {game.handNumber}</h2>
          <p>Mi {formatPoints(game.handPoints[myTeam])} · Oni {formatPoints(game.handPoints[oppTeam])}</p>
          <button className="btn" type="button" onClick={onNext}>Sljedeća ruka</button>
        </div>
      )}
      {game.phase === 'game-over' && (
        <div className="result">
          <h2>{game.winnerTeam === myTeam ? 'Pobijedili ste' : 'Izgubili ste'}</h2>
          <p>Mi {formatPoints(game.scores[myTeam])} · Oni {formatPoints(game.scores[oppTeam])}</p>
          <div className="row">
            <button className="btn" type="button" onClick={onAgain}>Igraj opet</button>
            <button className="btn secondary" type="button" onClick={onLeave}>Početna</button>
          </div>
        </div>
      )}
    </>
  );
}
