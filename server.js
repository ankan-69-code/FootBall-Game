const express = require('express');
const http = require('http');
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.get('/', (req, res) => res.sendFile(__dirname + '/index.html'));

let gameState = {
    players: {},
    ball: { x: 400, y: 225, vx: 0, vy: 0, friction: 0.97, radius: 10 },
    timer: 180,
    status: "WAITING", 
    winnerMessage: ""
};

function resetMatch() {
    gameState.timer = 180;
    gameState.status = Object.keys(gameState.players).length === 2 ? "PLAYING" : "WAITING";
    gameState.winnerMessage = "";
    gameState.ball = { x: 400, y: 225, vx: 0, vy: 0, friction: 0.97, radius: 10 };
    
    let isPlayerOne = true;
    for (let id in gameState.players) {
        gameState.players[id].score = 0;
        gameState.players[id].x = isPlayerOne ? 200 : 600;
        gameState.players[id].y = 225;
        // Reset held keys
        gameState.players[id].keys = {}; 
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
        radius: 20,
        color: isPlayerOne ? "#00d2ff" : "#ff0055",
        skin: "#ffcc99",
        score: 0,
        angle: isPlayerOne ? 0 : Math.PI,
        speed: 3.5,
        keys: {} // Track keys separately from movement
    };

    if (Object.keys(gameState.players).length === 2) resetMatch();

    socket.on('playerInput', (keys) => {
        if (gameState.status !== "PLAYING") return;
        let player = gameState.players[socket.id];
        // Just save the keys, don't move the player yet! (Fixes network bunching)
        if (player) player.keys = keys; 
    });

    socket.on('disconnect', () => {
        delete gameState.players[socket.id];
        gameState.status = "WAITING"; 
    });
});

// Server Timer
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

// Physics Loop (60 FPS)
setInterval(() => {
    if (gameState.status === "PLAYING") {
        
        // 1. Process Player Movement smoothly based on saved keys
        for (let id in gameState.players) {
            let p = gameState.players[id];
            if (!p.keys) continue;
            
            let dx = 0; let dy = 0;
            if (p.keys["ArrowUp"] && p.y > p.radius) dy -= p.speed;
            if (p.keys["ArrowDown"] && p.y < 450 - p.radius) dy += p.speed;
            if (p.keys["ArrowLeft"] && p.x > p.radius) dx -= p.speed;
            if (p.keys["ArrowRight"] && p.x < 800 - p.radius) dx += p.speed;

            p.x += dx; p.y += dy;
            if (dx !== 0 || dy !== 0) p.angle = Math.atan2(dy, dx);
        }

        // 2. Process Ball Physics
        let ball = gameState.ball;
        ball.vx *= ball.friction; 
        ball.vy *= ball.friction;
        ball.x += ball.vx; 
        ball.y += ball.vy;

        // Top/Bottom Walls
        if (ball.y < ball.radius || ball.y > 450 - ball.radius) {
            ball.vy *= -1;
            ball.y = ball.y < ball.radius ? ball.radius : 450 - ball.radius;
        }

        // Left/Right Goals & Walls
        const goalTop = 225 - 70;
        const goalBottom = 225 + 70;

        if (ball.x < ball.radius) {
            if (ball.y > goalTop && ball.y < goalBottom) {
                let players = Object.values(gameState.players);
                if (players[1]) players[1].score++; 
                ball.x = 400; ball.y = 225; ball.vx = 0; ball.vy = 0;
                players.forEach((p, i) => { p.x = i === 0 ? 200 : 600; p.y = 225; });
            } else {
                ball.vx *= -1; ball.x = ball.radius;
            }
        }

        if (ball.x > 800 - ball.radius) {
            if (ball.y > goalTop && ball.y < goalBottom) {
                let players = Object.values(gameState.players);
                if (players[0]) players[0].score++; 
                ball.x = 400; ball.y = 225; ball.vx = 0; ball.vy = 0;
                players.forEach((p, i) => { p.x = i === 0 ? 200 : 600; p.y = 225; });
            } else {
                ball.vx *= -1; ball.x = 800 - ball.radius;
            }
        }

        // 3. Check for kicks!
        for (let id in gameState.players) {
            let p = gameState.players[id];
            let dx = ball.x - p.x; let dy = ball.y - p.y;
            let distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance === 0) { dx = 0.1; dy = 0.1; distance = 0.14; }
            if (distance < p.radius + ball.radius) {
                let angle = Math.atan2(dy, dx);
                ball.vx += Math.cos(angle) * 6;
                ball.vy += Math.sin(angle) * 6;
                
                let overlap = (p.radius + ball.radius) - distance;
                ball.x += Math.cos(angle) * overlap;
                ball.y += Math.sin(angle) * overlap;
            }
        }
    }
    
    // Broadcast the exact truth to both players
    io.emit("gameStateUpdate", gameState);
}, 1000 / 60);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
