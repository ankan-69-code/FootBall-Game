const express = require('express');
const http = require('http');
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.get('/', (req, res) => res.sendFile(__dirname + '/index.html'));

let gameState = {
    players: {},
    ball: { x: 400, y: 225, vx: 0, vy: 0 },
    timer: 180,
    status: "WAITING", // WAITING, PLAYING, GAMEOVER
    winnerMessage: ""
};

let timerInterval;

function resetMatch() {
    gameState.timer = 180;
    gameState.status = Object.keys(gameState.players).length === 2 ? "PLAYING" : "WAITING";
    gameState.winnerMessage = "";
    gameState.ball = { x: 400, y: 225, vx: 0, vy: 0 };
    
    let isPlayerOne = true;
    for (let id in gameState.players) {
        gameState.players[id].score = 0;
        gameState.players[id].x = isPlayerOne ? 200 : 600;
        gameState.players[id].y = 225;
        isPlayerOne = false;
    }
}

io.on('connection', (socket) => {
    if (Object.keys(gameState.players).length >= 2) {
        socket.emit("status", "Server full!");
        socket.disconnect();
        return;
    }

    const isPlayerOne = Object.keys(gameState.players).length === 0;
    
    gameState.players[socket.id] = {
        x: isPlayerOne ? 200 : 600,
        y: 225,
        color: isPlayerOne ? "#00d2ff" : "#ff0055",
        skin: "#ffcc99",
        score: 0,
        angle: isPlayerOne ? 0 : Math.PI,
        speed: 5
    };

    if (Object.keys(gameState.players).length === 2) {
        resetMatch();
    }

    socket.on('playerInput', (keys) => {
        if (gameState.status !== "PLAYING") return;

        let player = gameState.players[socket.id];
        if (!player) return;

        let dx = 0; let dy = 0;
        if (keys["ArrowUp"]) dy -= player.speed;
        if (keys["ArrowDown"]) dy += player.speed;
        if (keys["ArrowLeft"]) dx -= player.speed;
        if (keys["ArrowRight"]) dx += player.speed;

        player.x += dx; player.y += dy;
        if (dx !== 0 || dy !== 0) player.angle = Math.atan2(dy, dx);
    });

    socket.on('disconnect', () => {
        delete gameState.players[socket.id];
        gameState.status = "WAITING"; 
    });
});

// Server Timer Loop 
setInterval(() => {
    if (gameState.status === "PLAYING") {
        gameState.timer--;
        if (gameState.timer <= 0) {
            gameState.status = "GAMEOVER";
            
            let p1 = Object.values(gameState.players)[0];
            let p2 = Object.values(gameState.players)[1];
            
            if (p1 && p2) {
                if (p1.score > p2.score) gameState.winnerMessage = "BLUE WINS!";
                else if (p2.score > p1.score) gameState.winnerMessage = "RED WINS!";
                else gameState.winnerMessage = "IT'S A DRAW!";
            }

            setTimeout(resetMatch, 5000);
        }
    }
}, 1000);

// Physics Loop
setInterval(() => {
    io.emit("gameStateUpdate", gameState);
}, 1000 / 60);

// Dynamic Port for Cloud Hosting
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));