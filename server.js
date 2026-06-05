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
    maxHttpBufferSize: 1e6 // 1MB для аудио данных
});

// Хранилище комнат и пользователей
const rooms = new Map();

// Статические файлы
app.use(express.static('public'));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

io.on('connection', (socket) => {
    console.log(`👤 Новый пользователь: ${socket.id}`);

    // Присоединение к комнате
    socket.on('join-room', (data) => {
        const { roomId, userName } = data;
        
        socket.join(roomId);
        socket.roomId = roomId;
        socket.userName = userName || 'Гость';
        socket.isMuted = false;

        // Инициализируем комнату если её нет
        if (!rooms.has(roomId)) {
            rooms.set(roomId, new Map());
        }
        
        rooms.get(roomId).set(socket.id, {
            id: socket.id,
            name: socket.userName,
            muted: false
        });

        // Отправляем список пользователей в комнате
        const usersList = Array.from(rooms.get(roomId).values());
        io.to(roomId).emit('users-update', usersList);
        
        // Уведомляем всех о новом пользователе
        socket.to(roomId).emit('user-connected', {
            id: socket.id,
            name: socket.userName
        });

        console.log(`📢 ${socket.userName} присоединился к комнате ${roomId}`);
    });

    // Пересылка аудио данных
    socket.on('audio-data', (data) => {
        if (socket.roomId && !socket.isMuted) {
            socket.to(socket.roomId).emit('audio-data', {
                userId: socket.id,
                audio: data
            });
        }
    });

    // Мут/анмут
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
        }
    });

    // Отключение пользователя
    socket.on('disconnect', () => {
        console.log(`👋 Пользователь отключился: ${socket.id}`);
        
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

// Для Render используем PORT из переменных окружения
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Сервер запущен на порту ${PORT}`);
});
