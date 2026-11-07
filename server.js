const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" },
  maxHttpBufferSize: 100 * 1024
});

app.use(express.static(path.join(__dirname, "public")));
app.get("/health", (_req, res) => res.json({ ok: true, service: "Board Arena" }));

const rooms = new Map();
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function makeCode() {
  let code;
  do {
    code = Array.from({ length: 6 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join("");
  } while (rooms.has(code));
  return code;
}
function roomPlayers(room) {
  return room.players.map(id => {
    const s = io.sockets.sockets.get(id);
    return { ready: !!(s && s.data.ready) };
  });
}
function emitRoom(roomCode) {
  const room = rooms.get(roomCode);
  if (!room) return;
  io.to(roomCode).emit("room_update", { roomCode, players: roomPlayers(room) });
}
function removeFromRoom(socket, notify = true) {
  const code = socket.data.roomCode;
  if (!code) return;
  const room = rooms.get(code);
  socket.leave(code);
  socket.data.roomCode = null;
  socket.data.ready = false;
  if (!room) return;
  room.players = room.players.filter(id => id !== socket.id);
  if (notify) socket.to(code).emit("player_left");
  if (room.players.length === 0) rooms.delete(code);
  else emitRoom(code);
}

io.on("connection", socket => {
  socket.on("create_room", () => {
    if (socket.data.roomCode) removeFromRoom(socket);
    const roomCode = makeCode();
    const room = { players: [socket.id] };
    rooms.set(roomCode, room);
    socket.join(roomCode);
    socket.data.roomCode = roomCode;
    socket.data.ready = false;
    socket.emit("room_created", { roomCode, playerNumber: 1, players: roomPlayers(room) });
  });

  socket.on("join_room", payload => {
    const roomCode = String(payload?.roomCode || "").trim().toUpperCase();
    const room = rooms.get(roomCode);
    if (!/^[A-HJ-NP-Z2-9]{6}$/.test(roomCode) || !room) {
      socket.emit("room_error", { message: "ไม่พบห้องนี้ กรุณาตรวจสอบรหัสห้อง" });
      return;
    }
    if (room.players.length >= 2) {
      socket.emit("room_error", { message: "ห้องนี้มีผู้เล่นครบ 2 คนแล้ว" });
      return;
    }
    if (socket.data.roomCode) removeFromRoom(socket);
    room.players.push(socket.id);
    socket.join(roomCode);
    socket.data.roomCode = roomCode;
    socket.data.ready = false;
    socket.emit("room_joined", { roomCode, playerNumber: 2, players: roomPlayers(room) });
    emitRoom(roomCode);
  });

  socket.on("set_ready", payload => {
    const roomCode = socket.data.roomCode;
    if (!roomCode || payload?.roomCode !== roomCode) return;
    const room = rooms.get(roomCode);
    if (!room || room.players.length !== 2) {
      socket.emit("room_error", { message: "ต้องมีผู้เล่นครบ 2 คนก่อนจึงกดพร้อมได้" });
      return;
    }
    socket.data.ready = true;
    emitRoom(roomCode);
  });

  socket.on("leave_room", () => removeFromRoom(socket));
  socket.on("disconnect", () => removeFromRoom(socket));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, "0.0.0.0", () => {
  console.log(`Board Arena server listening on ${PORT}`);
});
