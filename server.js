const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] },
    maxHttpBufferSize: 1e8
});

app.use(express.static('public'));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const rooms = new Map();

io.on('connection', (socket) => {
    console.log(`👤 ${socket.id}`);

    socket.on('join-room', ({ roomId, userName }) => {
        socket.join(roomId);
        socket.roomId = roomId;
        socket.userName = userName || 'Гость';
        socket.isMuted = false;

        if (!rooms.has(roomId)) rooms.set(roomId, new Map());
        
        rooms.get(roomId).set(socket.id, {
            id: socket.id,
            name: socket.userName,
            muted: false
        });

        // Говорим всем в комнате о новом пользователе
        socket.to(roomId).emit('user-joined', {
            id: socket.id,
            name: socket.userName
        });

        io.to(roomId).emit('users-update', 
            Array.from(rooms.get(roomId).values())
        );
    });

    // WebRTC сигналинг
    socket.on('offer', ({ offer, to }) => {
        socket.to(to).emit('offer', {
            offer: offer,
            from: socket.id,
            name: socket.userName
        });
    });

    socket.on('answer', ({ answer, to }) => {
        socket.to(to).emit('answer', {
            answer: answer,
            from: socket.id
        });
    });

    socket.on('ice-candidate', ({ candidate, to }) => {
        socket.to(to).emit('ice-candidate', {
            candidate: candidate,
            from: socket.id
        });
    });

    socket.on('toggle-mute', () => {
        if (!socket.roomId || !rooms.has(socket.roomId)) return;
        
        socket.isMuted = !socket.isMuted;
        const user = rooms.get(socket.roomId).get(socket.id);
        if (user) user.muted = socket.isMuted;

        io.to(socket.roomId).emit('user-mute-update', {
            userId: socket.id,
            muted: socket.isMuted
        });
        socket.emit('mute-status', socket.isMuted);
    });

    socket.on('disconnect', () => {
        if (!socket.roomId || !rooms.has(socket.roomId)) return;
        
        rooms.get(socket.roomId).delete(socket.id);
        
        if (rooms.get(socket.roomId).size === 0) {
            rooms.delete(socket.roomId);
        } else {
            io.to(socket.roomId).emit('users-update',
                Array.from(rooms.get(socket.roomId).values())
            );
        }
        
        socket.to(socket.roomId).emit('user-left', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Порт ${PORT}`));
