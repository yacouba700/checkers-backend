require("dotenv").config();

const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

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
  socket.on("create_user", async (username, callback) => {

  const { data: existingUser } = await supabase
    .from("users")
    .select("*")
    .eq("username", username)
    .single();

  if (existingUser) {
    return callback({
      success: true,
      user: existingUser
    });
  }

  const { data, error } = await supabase
    .from("users")
    .insert([
      {
        username,
        balance: 0
      }
    ])
    .select()
    .single();

  if (error) {
    return callback({
      success: false,
      error: error.message
    });
  }

  users[socket.id] = {
    socketId: socket.id,
    userId: data.id,
    username: data.username,
    balance: data.balance,
    roomId: null
  };

  callback({
    success: true,
    user: data
  });

  console.log("User created:", username);
});

  
  // =========================
  // ADD_BALANCE
  // =========================



  socket.on("add_balance", async (data, callback) => {

  try {

    const { id: userId, amount } = data;

    console.log("DATA REÇUE:", data);
    console.log("USER ID:", userId, id);

    if (!userId) {
      return callback({
        success: false,
        message: "userId manquant"
      });
    }

    if (amount <= 0) {
      return callback({
        success: false,
        message: "Montant invalide"
      });
    }

    const { data: user, error } = await supabase
      .from("users")
      .select("*")
      .eq("id", userId)
      .maybeSingle();

    console.log("USER FOUND:", user, error);

    if (error || !user) {
      return callback({
        success: false,
        message: "Utilisateur introuvable"
      });
    }

    const newBalance = user.balance + amount;

    const { error: updateError } = await supabase
      .from("users")
      .update({ balance: newBalance })
      .eq("id", userId);

    if (updateError) {
      return callback({
        success: false,
        message: updateError.message
      });
    }

    await supabase
      .from("transactions")
      .insert([{
        user_id: userId,
        type: "deposit",
        amount,
        balance_before: user.balance,
        balance_after: newBalance,
        description: "Recharge wallet"
      }]);

    callback({
      success: true,
      balance: newBalance
    });

  } catch (err) {
    callback({
      success: false,
      message: err.message
    });
  }

});
  

  //====≠=================
  //GET_BALANCE
  //=========================
  socket.on("get_balance", async (userId, callback) => {

  const { data, error } = await supabase
    .from("users")
    .select("balance")
    .eq("id", userId)
    .single();

  if (error) {
    return callback({
      success: false,
      message: error.message
    });
  }

  callback({
    success: true,
    balance: data.balance
  });

});

  
  // =========================
  // CREATE ROOM
  // =========================
  socket.on("create_room", () => {
  const roomId = Math.random().toString(36).substring(2, 8);

  rooms[roomId] = {
    roomId,
    players: [],
    status: "waiting"
  };

  socket.emit("room_created", {
    success: true,
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
