const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" }, maxHttpBufferSize: 256 * 1024 });
app.use(express.static(path.join(__dirname, "public")));
app.get("/health", (_req, res) => res.json({ ok: true, service: "Board Arena" }));

const rooms = new Map();
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function makeCode() {
  let code;
  do { code = Array.from({ length: 6 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join(""); }
  while (rooms.has(code));
  return code;
}
function roomPlayers(room) {
  return room.players.map(id => {
    const s = io.sockets.sockets.get(id);
    return { ready: !!(s && s.data.ready), selected: !!(s && s.data.selected) };
  });
}
function emitRoom(code) {
  const room = rooms.get(code);
  if (room) io.to(code).emit("room_update", { roomCode: code, players: roomPlayers(room) });
}
function removeFromRoom(socket, notify = true) {
  const code = socket.data.roomCode;
  if (!code) return;
  const room = rooms.get(code);
  socket.leave(code); socket.data.roomCode = null; socket.data.ready = false; socket.data.selected = false;
  if (!room) return;
  room.players = room.players.filter(id => id !== socket.id);
  if (notify) socket.to(code).emit("player_left");
  if (!room.players.length) rooms.delete(code);
  else { room.gameStarted = false; room.picks = [null, null]; emitRoom(code); }
}

io.on("connection", socket => {
  socket.on("create_room", () => {
    if (socket.data.roomCode) removeFromRoom(socket);
    const roomCode = makeCode(), room = { players: [socket.id], picks: [null, null], gameStarted: false };
    rooms.set(roomCode, room); socket.join(roomCode); socket.data.roomCode = roomCode;
    socket.data.playerNumber = 1; socket.data.ready = false; socket.data.selected = false;
    socket.emit("room_created", { roomCode, playerNumber: 1, players: roomPlayers(room) });
  });
  socket.on("join_room", payload => {
    const roomCode = String(payload?.roomCode || "").trim().toUpperCase(), room = rooms.get(roomCode);
    if (!/^[A-HJ-NP-Z2-9]{6}$/.test(roomCode) || !room) return socket.emit("room_error", { message: "ไม่พบห้องนี้ กรุณาตรวจสอบรหัสห้อง" });
    if (room.players.length >= 2 || room.gameStarted) return socket.emit("room_error", { message: "ห้องนี้มีผู้เล่นครบหรือเริ่มเกมแล้ว" });
    if (socket.data.roomCode) removeFromRoom(socket);
    room.players.push(socket.id); socket.join(roomCode); socket.data.roomCode = roomCode;
    socket.data.playerNumber = 2; socket.data.ready = false; socket.data.selected = false;
    socket.emit("room_joined", { roomCode, playerNumber: 2, players: roomPlayers(room) }); emitRoom(roomCode);
  });
  socket.on("set_ready", payload => {
    const code = socket.data.roomCode, room = rooms.get(code);
    if (!code || payload?.roomCode !== code || !room || room.players.length !== 2) return;
    socket.data.ready = true; emitRoom(code);
  });
  socket.on("submit_pick", payload => {
    const code = socket.data.roomCode, room = rooms.get(code), picks = payload?.picks;
    if (!code || payload?.roomCode !== code || !room || room.players.length !== 2 || !socket.data.ready || room.gameStarted) return;
    const population = { sword: 2, archer: 2, mage: 3, shield: 2, meric: 3, assassin: 3, witch: 3 };
    const valid = Array.isArray(picks) && picks.length >= 1 && picks.every(k => Object.prototype.hasOwnProperty.call(population, k)) && new Set(picks).size === picks.length && picks.reduce((sum, k) => sum + population[k], 0) <= 15;
    if (!valid) return socket.emit("room_error", { message: "ชุดตัวละครไม่ถูกต้อง หรือ Population เกิน 15 กรุณาเลือกใหม่" });
    const index = room.players.indexOf(socket.id);
    if (index < 0) return;
    room.picks[index] = picks; socket.data.selected = true; emitRoom(code);
    if (room.picks.every(Boolean)) {
      room.gameStarted = true;
      io.to(code).emit("game_start", { picks: room.picks, firstTurn: Math.random() < 0.5 ? 0 : 1 });
    }
  });
  socket.on("game_state", payload => {
    const code = socket.data.roomCode, room = rooms.get(code);
    if (!code || payload?.roomCode !== code || !room?.gameStarted || room.players.indexOf(socket.id) < 0) return;
    const state = payload.state;
    if (!state || !Array.isArray(state.U) || !Array.isArray(state.P) || ![0, 1].includes(state.turn)) return;
    // Relay the latest authoritative game snapshot to the opponent; never echo it to its sender.
    socket.to(code).emit("game_state", { state });
  });
  socket.on("leave_room", () => removeFromRoom(socket));
  socket.on("disconnect", () => removeFromRoom(socket));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, "0.0.0.0", () => console.log(`Board Arena server listening on ${PORT}`));
