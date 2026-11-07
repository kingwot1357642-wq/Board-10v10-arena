const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const crypto = require("crypto");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" },
  pingInterval: 25000,
  pingTimeout: 20000
});

const PORT = process.env.PORT || 3000;
const rooms = new Map();

app.use(express.static("public"));
app.get("/health", (_req, res) => res.json({ ok: true, service: "board-arena-server" }));

function makeCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code;
  do {
    code = Array.from({ length: 6 }, () => chars[crypto.randomInt(chars.length)]).join("");
  } while (rooms.has(code));
  return code;
}
function roomView(room) {
  return {
    code: room.code,
    phase: room.phase,
    players: room.players.map((p, index) => p ? {
      slot: index + 1,
      connected: true,
      ready: !!p.ready
    } : null)
  };
}
function emitRoom(room) {
  io.to(room.code).emit("room:update", roomView(room));
}
function leaveRoom(socket) {
  const code = socket.data.roomCode;
  if (!code) return;
  const room = rooms.get(code);
  const slot = socket.data.slot;
  socket.leave(code);
  socket.data.roomCode = null;
  socket.data.slot = null;
  if (!room) return;
  if (slot !== null && slot !== undefined) room.players[slot] = null;
  if (room.players.every(p => !p)) {
    rooms.delete(code);
  } else {
    room.phase = "waiting";
    room.players.forEach(p => { if (p) p.ready = false; });
    emitRoom(room);
    io.to(code).emit("room:notice", "ผู้เล่นอีกฝ่ายออกจากห้อง");
  }
}

io.on("connection", socket => {
  socket.on("room:create", (ack = () => {}) => {
    if (socket.data.roomCode) leaveRoom(socket);
    const code = makeCode();
    const room = {
      code,
      phase: "waiting",
      players: [socket, null],
      createdAt: Date.now(),
      gameState: null
    };
    rooms.set(code, room);
    socket.join(code);
    socket.data.roomCode = code;
    socket.data.slot = 0;
    socket.emit("room:joined", { code, slot: 0 });
    emitRoom(room);
    ack({ ok: true, code, slot: 0 });
  });

  socket.on("room:join", (rawCode, ack = () => {}) => {
    const code = String(rawCode || "").trim().toUpperCase();
    const room = rooms.get(code);
    if (!room) return ack({ ok: false, error: "ไม่พบห้องนี้" });
    if (room.players[1]) return ack({ ok: false, error: "ห้องเต็มแล้ว" });
    if (socket.data.roomCode) leaveRoom(socket);
    room.players[1] = socket;
    socket.join(code);
    socket.data.roomCode = code;
    socket.data.slot = 1;
    socket.emit("room:joined", { code, slot: 1 });
    emitRoom(room);
    ack({ ok: true, code, slot: 1 });
  });

  socket.on("room:ready", (ready, ack = () => {}) => {
    const room = rooms.get(socket.data.roomCode);
    const slot = socket.data.slot;
    if (!room || slot === null || slot === undefined) return ack({ ok: false, error: "ยังไม่ได้เข้าห้อง" });
    if (!room.players[0] || !room.players[1]) return ack({ ok: false, error: "ต้องรอผู้เล่นครบ 2 คน" });
    room.players[slot].ready = !!ready;
    if (room.players.every(p => p && p.ready)) {
      room.phase = "ready";
      io.to(room.code).emit("room:both_ready");
    }
    emitRoom(room);
    ack({ ok: true });
  });

  // Generic event relay for the next development stage (draft, placement and battle sync).
  // The server checks that the sender belongs to the room and limits the payload size.
  socket.on("game:relay", (payload, ack = () => {}) => {
    const room = rooms.get(socket.data.roomCode);
    if (!room) return ack({ ok: false, error: "ไม่พบห้อง" });
    const size = Buffer.byteLength(JSON.stringify(payload ?? {}), "utf8");
    if (size > 100_000) return ack({ ok: false, error: "ข้อมูลใหญ่เกินไป" });
    socket.to(room.code).emit("game:relay", {
      from: socket.data.slot,
      payload
    });
    ack({ ok: true });
  });

  socket.on("room:leave", () => leaveRoom(socket));
  socket.on("disconnect", () => {
    const code = socket.data.roomCode;
    const slot = socket.data.slot;
    if (!code) return;
    const room = rooms.get(code);
    if (!room) return;
    room.players[slot] = null;
    if (room.players.every(p => !p)) rooms.delete(code);
    else {
      room.phase = "waiting";
      room.players.forEach(p => { if (p) p.ready = false; });
      emitRoom(room);
      io.to(code).emit("room:notice", "การเชื่อมต่อของผู้เล่นอีกฝ่ายขาดหาย");
    }
  });
});

// Remove abandoned rooms after 2 hours.
setInterval(() => {
  const cutoff = Date.now() - 2 * 60 * 60 * 1000;
  for (const [code, room] of rooms) {
    if (room.createdAt < cutoff && room.players.every(p => !p)) rooms.delete(code);
  }
}, 10 * 60 * 1000).unref();

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Board Arena server listening on port ${PORT}`);
});
