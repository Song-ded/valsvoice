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
    },
    maxHttpBufferSize: 1e8, // 100MB буфер для аудио
    pingTimeout: 60000,
    pingInterval: 25000
});

app.use(express.static('public'));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const rooms = new Map();

io.on('connection', (socket) => {
    console.log(`👤 Подключился: ${socket.id}`);

    socket.on('join-room', (data) => {
        const { roomId, userName } = data;
        
        socket.join(roomId);
        socket.roomId = roomId;
        socket.userName = userName || 'Гость';
        socket.isMuted = false;

        if (!rooms.has(roomId)) {
            rooms.set(roomId, new Map());
        }
        
        rooms.get(roomId).set(socket.id, {
            id: socket.id,
            name: socket.userName,
            muted: false
        });

        // Сообщаем всем о новом пользователе
        socket.to(roomId).emit('user-connected', {
            id: socket.id,
            name: socket.userName
        });

        // Отправляем обновленный список
        const usersList = Array.from(rooms.get(roomId).values());
        io.to(roomId).emit('users-update', usersList);

        console.log(`📢 ${socket.userName} зашел в комнату ${roomId} (всего: ${usersList.length})`);
    });

    // Пересылка аудио между пользователями
    socket.on('audio-stream', (audioData) => {
        if (socket.roomId && !socket.isMuted) {
            // Отправляем аудио всем в комнате кроме отправителя
            socket.to(socket.roomId).emit('audio-stream', {
                userId: socket.id,
                userName: socket.userName,
                audio: audioData
            });
        }
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

            socket.emit('mute-status', socket.isMuted);
            console.log(`🔇 ${socket.userName} ${socket.isMuted ? 'замутился' : 'включил микрофон'}`);
        }
    });

    socket.on('disconnect', () => {
        console.log(`👋 Отключился: ${socket.id} (${socket.userName})`);
        
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
    console.log(`🚀 Сервер запущен на порту ${PORT}`);
});
