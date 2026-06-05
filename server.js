const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

app.use(express.static('public'));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const rooms = new Map();

io.on('connection', (socket) => {
    console.log(`👤 Подключился: ${socket.id}`);

    socket.on('join-room', (data) => {
        const { roomId, userName, peerId } = data;
        
        socket.join(roomId);
        socket.roomId = roomId;
        socket.userName = userName || 'Гость';
        socket.peerId = peerId;
        socket.isMuted = false;

        if (!rooms.has(roomId)) {
            rooms.set(roomId, new Map());
        }
        
        rooms.get(roomId).set(socket.id, {
            id: socket.id,
            name: socket.userName,
            peerId: peerId,
            muted: false
        });

        // Отправляем новому пользователю список всех кто уже в комнате
        const existingUsers = [];
        rooms.get(roomId).forEach((user, userId) => {
            if (userId !== socket.id) {
                existingUsers.push(user);
            }
        });
        socket.emit('existing-users', existingUsers);

        // Сообщаем остальным о новом пользователе
        socket.to(roomId).emit('user-connected', {
            id: socket.id,
            name: socket.userName,
            peerId: peerId
        });

        // Обновляем список для всех
        const usersList = Array.from(rooms.get(roomId).values());
        io.to(roomId).emit('users-update', usersList);

        console.log(`📢 ${socket.userName} зашел в комнату ${roomId}`);
    });

    socket.on('toggle-mute', () => {
        if (socket.roomId && rooms.has(socket.roomId)) {
            socket.isMuted = !socket.isMuted;
            const userRoom = rooms.get(socket.roomId);
            
            if (userRoom.has(socket.id)) {
                userRoom.get(socket.id).muted = socket.isMuted;
            }

            io.to(socket.roomId).emit('user-mute-update', {
                userId: socket.id,
                muted: socket.isMuted
            });
        }
    });

    socket.on('disconnect', () => {
        console.log(`👋 Отключился: ${socket.id}`);
        
        if (socket.roomId && rooms.has(socket.roomId)) {
            rooms.get(socket.roomId).delete(socket.id);
            
            if (rooms.get(socket.roomId).size === 0) {
                rooms.delete(socket.roomId);
            } else {
                const usersList = Array.from(rooms.get(socket.roomId).values());
                io.to(socket.roomId).emit('users-update', usersList);
            }

            socket.to(socket.roomId).emit('user-disconnected', socket.id);
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Сервер на порту ${PORT}`);
});
