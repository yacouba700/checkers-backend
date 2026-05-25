const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");

const app = express();
app.use(cors());

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*"
  }
});

// Stockage en mémoire (temporaire étape 1)
const users = {};
const rooms = {};

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  // =========================
  // CREATE USER
  // =========================
  socket.on("create_user", (username, callback) => {
    users[socket.id] = {
      userId: socket.id,
      username,
      balance: 0,
      roomId: null
    };

    callback({
      success: true,
      user: users[socket.id]
    });
  });

  // =========================
  // CREATE ROOM
  // =========================
  socket.on("create_room", (callback) => {
    const roomId = Math.random().toString(36).substring(2, 8);

    rooms[roomId] = {
      roomId,
      players: [],
      status: "waiting"
    };

    callback({
      success: true,
      roomId
    });
  });

  // =========================
  // JOIN ROOM
  // =========================
  socket.on("join_room", (roomId, callback) => {
    const room = rooms[roomId];
    const user = users[socket.id];

    if (!room) {
      return callback({ success: false, message: "Room inexistante" });
    }

    if (!user) {
      return callback({ success: false, message: "Utilisateur non créé" });
    }

    if (room.players.length >= 2) {
      return callback({ success: false, message: "Room pleine" });
    }

    room.players.push(socket.id);
    user.roomId = roomId;

    socket.join(roomId);

    io.to(roomId).emit("user_joined", {
      userId: socket.id,
      username: user.username
    });

    callback({
      success: true,
      roomId,
      players: room.players
    });

    if (room.players.length === 2) {
      room.status = "ready";

      io.to(roomId).emit("room_ready", {
        message: "Les deux joueurs sont connectés"
      });
    }
  });

  // =========================
  // GAME EVENT (TEST)
  // =========================
  socket.on("game_event", (data) => {
    const user = users[socket.id];
    if (!user?.roomId) return;

    io.to(user.roomId).emit("game_update", data);
  });

  // =========================
  // DISCONNECT
  // =========================
  socket.on("disconnect", () => {
    const user = users[socket.id];

    if (user?.roomId) {
      const room = rooms[user.roomId];
      if (room) {
        room.players = room.players.filter(id => id !== socket.id);

        io.to(user.roomId).emit("user_left", {
          userId: socket.id
        });
      }
    }

    delete users[socket.id];

    console.log("User disconnected:", socket.id);
  });
});

app.get("/", (req, res) => {
  res.send("Socket.IO server is running");
});

server.listen(3000, () => {
  console.log("Server running on port 3000");
});
