const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

app.use(express.static(path.join(__dirname, 'public')));

// Rooms: { roomId: { users: Map<socketId, { id, name, muted }> } }
const rooms = new Map();

function getRoomUsers(roomId) {
  if (!rooms.has(roomId)) return [];
  return Array.from(rooms.get(roomId).users.values());
}

io.on('connection', (socket) => {
  console.log(`[+] Connected: ${socket.id}`);

  // Join room
  socket.on('join-room', ({ roomId, userName, userAvatar }) => {
    const userId = socket.id;
    const name   = (userName   || 'Guest').slice(0, 24);
    const avatar = (userAvatar || '').slice(0, 512); // Google avatar URL

    if (!rooms.has(roomId)) {
      rooms.set(roomId, { users: new Map() });
    }

    const room = rooms.get(roomId);
    const user = { id: userId, name, avatar, muted: false };
    room.users.set(userId, user);

    socket.join(roomId);
    socket.data.roomId = roomId;
    socket.data.userId = userId;

    // Tell the new user who else is in the room
    const others = getRoomUsers(roomId).filter(u => u.id !== userId);
    socket.emit('room-joined', { userId, roomId, users: others });

    // Tell others a new user joined
    socket.to(roomId).emit('user-joined', user);

    console.log(`[Room ${roomId}] ${name} joined. Total: ${room.users.size}`);
  });

  // WebRTC signaling
  socket.on('offer', ({ to, offer }) => {
    socket.to(to).emit('offer', { from: socket.id, offer });
  });

  socket.on('answer', ({ to, answer }) => {
    socket.to(to).emit('answer', { from: socket.id, answer });
  });

  socket.on('ice-candidate', ({ to, candidate }) => {
    socket.to(to).emit('ice-candidate', { from: socket.id, candidate });
  });

  // Mute state
  socket.on('toggle-mute', ({ muted }) => {
    const { roomId, userId } = socket.data;
    if (!roomId || !rooms.has(roomId)) return;

    const room = rooms.get(roomId);
    const user = room.users.get(userId);
    if (user) {
      user.muted = muted;
      io.to(roomId).emit('user-mute-changed', { userId, muted });
    }
  });

  // Chat message
  socket.on('chat-message', ({ text }) => {
    const { roomId, userId } = socket.data;
    if (!roomId || !rooms.has(roomId)) return;
    const room = rooms.get(roomId);
    const user = room.users.get(userId);
    if (!user || !text || text.length > 500) return;

    io.to(roomId).emit('chat-message', {
      from: userId,
      name: user.name,
      text: text.trim(),
      ts: Date.now()
    });
  });

  // Disconnect
  socket.on('disconnect', () => {
    const { roomId, userId } = socket.data;
    if (roomId && rooms.has(roomId)) {
      const room = rooms.get(roomId);
      const user = room.users.get(userId);
      room.users.delete(userId);

      if (room.users.size === 0) {
        rooms.delete(roomId);
        console.log(`[Room ${roomId}] Empty, removed.`);
      } else {
        socket.to(roomId).emit('user-left', { userId });
        console.log(`[Room ${roomId}] ${user?.name} left. Remaining: ${room.users.size}`);
      }
    }
    console.log(`[-] Disconnected: ${socket.id}`);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\n🎙  Voice Chat server running on http://localhost:${PORT}\n`);
});
