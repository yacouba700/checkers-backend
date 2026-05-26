const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");

const PORT = process.env.PORT || 3000;

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
    message: "room_created",
    roomId
  });

  console.log("Room created:", roomId);
});

  // =========================
  // JOIN ROOM
  // =========================
  socket.on("join_room", (roomId) => {
  const room = rooms[roomId];
  const user = users[socket.id];

  if (!room) {
    return socket.emit("room_error", {
      success: false,
      message: "Room inexistante"
    });
  }

  if (!user) {
    return socket.emit("room_error", {
      success: false,
      message: "Utilisateur non créé"
    });
  }

  if (room.players.length >= 2) {
    return socket.emit("room_error", {
      success: false,
      message: "Room pleine"
    });
    console.log("rom pleine");
  }

  room.players.push(socket.id);
  user.roomId = roomId;

  socket.join(roomId);

  socket.emit("room_joined", {
    success: true,
    roomId
  });

  io.to(roomId).emit("user_joined", {
    username: user.username
  });

  console.log(user.username, "joined room", roomId);

  if (room.players.length === 2) {
    io.to(roomId).emit("room_ready", {
      message: "2 joueurs connectés"
    });
    console.log("deux joueurs connecter", roomId);
  }
});


  
  // =========================
  // GAME EVENT (TEST)
  // =========================
  socket.on("game_event", (data) => {
  console.log("GAME EVENT:", data);

  const user = users[socket.id];

  if (!user?.roomId) {
    console.log("User not in room");
    return;
  }

  io.to(user.roomId).emit("game_update", data);
  console.log("game_update", data);
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


 
server.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
