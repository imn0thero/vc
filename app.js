const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const fs = require('fs').promises;
const bcrypt = require('bcrypt');
const session = require('express-session');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use(session({
    secret: 'chat-app-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false }
}));

// Data files
const USERS_FILE = 'users.json';
const MESSAGES_FILE = 'messages.json';
const ONLINE_USERS_FILE = 'online_users.json';

// Initialize data files
async function initializeFiles() {
    try {
        await fs.access(USERS_FILE);
    } catch {
        await fs.writeFile(USERS_FILE, '[]');
    }
    
    try {
        await fs.access(MESSAGES_FILE);
    } catch {
        await fs.writeFile(MESSAGES_FILE, '[]');
    }
    
    try {
        await fs.access(ONLINE_USERS_FILE);
    } catch {
        await fs.writeFile(ONLINE_USERS_FILE, '[]');
    }
}

// Helper functions
async function readJsonFile(filename) {
    try {
        const data = await fs.readFile(filename, 'utf8');
        return JSON.parse(data);
    } catch {
        return [];
    }
}

async function writeJsonFile(filename, data) {
    await fs.writeFile(filename, JSON.stringify(data, null, 2));
}

// Auto delete messages older than 24 hours
async function cleanOldMessages() {
    const messages = await readJsonFile(MESSAGES_FILE);
    const now = new Date();
    const filteredMessages = messages.filter(msg => {
        const messageTime = new Date(msg.timestamp);
        const timeDiff = now - messageTime;
        return timeDiff < 24 * 60 * 60 * 1000; // 24 hours in milliseconds
    });
    
    if (filteredMessages.length !== messages.length) {
        await writeJsonFile(MESSAGES_FILE, filteredMessages);
        io.emit('messagesUpdated', filteredMessages);
    }
}

// Clean messages every hour
setInterval(cleanOldMessages, 60 * 60 * 1000);

// Routes
app.get('/', (req, res) => {
    if (req.session.userId) {
        res.sendFile(path.join(__dirname, 'public', 'chat.html'));
    } else {
        res.sendFile(path.join(__dirname, 'public', 'login.html'));
    }
});

app.get('/chat', (req, res) => {
    if (req.session.userId) {
        res.sendFile(path.join(__dirname, 'public', 'chat.html'));
    } else {
        res.redirect('/');
    }
});

app.post('/signup', async (req, res) => {
    try {
        const { username, password } = req.body;
        const users = await readJsonFile(USERS_FILE);
        
        if (users.find(u => u.username === username)) {
            return res.json({ success: false, message: 'Username sudah digunakan' });
        }
        
        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = {
            id: Date.now().toString(),
            username,
            password: hashedPassword,
            createdAt: new Date().toISOString()
        };
        
        users.push(newUser);
        await writeJsonFile(USERS_FILE, users);
        
        req.session.userId = newUser.id;
        req.session.username = newUser.username;
        
        res.json({ success: true });
    } catch (error) {
        res.json({ success: false, message: 'Terjadi kesalahan server' });
    }
});

app.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const users = await readJsonFile(USERS_FILE);
        
        const user = users.find(u => u.username === username);
        if (!user) {
            return res.json({ success: false, message: 'Username tidak ditemukan' });
        }
        
        const isValidPassword = await bcrypt.compare(password, user.password);
        if (!isValidPassword) {
            return res.json({ success: false, message: 'Password salah' });
        }
        
        req.session.userId = user.id;
        req.session.username = user.username;
        
        res.json({ success: true });
    } catch (error) {
        res.json({ success: false, message: 'Terjadi kesalahan server' });
    }
});

app.post('/logout', async (req, res) => {
    const userId = req.session.userId;
    req.session.destroy();
    
    // Remove from online users
    if (userId) {
        const onlineUsers = await readJsonFile(ONLINE_USERS_FILE);
        const updatedOnlineUsers = onlineUsers.filter(u => u.id !== userId);
        await writeJsonFile(ONLINE_USERS_FILE, updatedOnlineUsers);
        io.emit('userStatusUpdate', updatedOnlineUsers);
    }
    
    res.json({ success: true });
});

app.get('/messages', async (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const messages = await readJsonFile(MESSAGES_FILE);
    res.json(messages);
});

app.delete('/messages', async (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    
    await writeJsonFile(MESSAGES_FILE, []);
    io.emit('messagesCleared');
    res.json({ success: true });
});

app.get('/user', (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    
    res.json({
        id: req.session.userId,
        username: req.session.username
    });
});

// Socket.IO connection handling
io.on('connection', async (socket) => {
    socket.on('userConnected', async (userData) => {
        socket.userId = userData.id;
        socket.username = userData.username;
        
        // Add to online users
        const onlineUsers = await readJsonFile(ONLINE_USERS_FILE);
        const existingUser = onlineUsers.find(u => u.id === userData.id);
        
        if (!existingUser) {
            onlineUsers.push({
                id: userData.id,
                username: userData.username,
                socketId: socket.id,
                lastSeen: new Date().toISOString()
            });
            await writeJsonFile(ONLINE_USERS_FILE, onlineUsers);
        } else {
            existingUser.socketId = socket.id;
            existingUser.lastSeen = new Date().toISOString();
            await writeJsonFile(ONLINE_USERS_FILE, onlineUsers);
        }
        
        io.emit('userStatusUpdate', onlineUsers);
    });
    
    socket.on('sendMessage', async (messageData) => {
        const messages = await readJsonFile(MESSAGES_FILE);
        const newMessage = {
            id: Date.now().toString(),
            userId: socket.userId,
            username: socket.username,
            text: messageData.text,
            timestamp: new Date().toISOString()
        };
        
        messages.push(newMessage);
        await writeJsonFile(MESSAGES_FILE, messages);
        
        io.emit('newMessage', newMessage);
    });
    
    socket.on('videoCallRequest', (data) => {
        socket.to(data.targetUserId).emit('incomingVideoCall', {
            from: socket.userId,
            fromUsername: socket.username,
            offer: data.offer
        });
    });
    
    socket.on('videoCallAnswer', (data) => {
        socket.to(data.targetUserId).emit('videoCallAnswered', {
            answer: data.answer
        });
    });
    
    socket.on('videoCallReject', (data) => {
        socket.to(data.targetUserId).emit('videoCallRejected');
    });
    
    socket.on('iceCandidate', (data) => {
        socket.to(data.targetUserId).emit('iceCandidate', {
            candidate: data.candidate
        });
    });
    
    socket.on('disconnect', async () => {
        if (socket.userId) {
            const onlineUsers = await readJsonFile(ONLINE_USERS_FILE);
            const updatedOnlineUsers = onlineUsers.filter(u => u.id !== socket.userId);
            await writeJsonFile(ONLINE_USERS_FILE, updatedOnlineUsers);
            io.emit('userStatusUpdate', updatedOnlineUsers);
        }
    });
});

// Initialize and start server
initializeFiles().then(() => {
    const PORT = process.env.PORT || 3000;
    server.listen(PORT, () => {
        console.log(`Server berjalan di http://localhost:${PORT}`);
    });
});
