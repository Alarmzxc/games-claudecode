(function () {
    'use strict';

    // ---- DOM refs ----
    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');
    const scoreEl = document.getElementById('score');
    const highScoreEl = document.getElementById('highScore');
    const overlay = document.getElementById('overlay');
    const overlayContent = document.getElementById('overlayContent');
    const startBtn = document.getElementById('startBtn');
    const playerNameInput = document.getElementById('playerName');
    const cloudBadge = document.getElementById('cloudBadge');
    const lbList = document.getElementById('lbList');
    const lbStatus = document.getElementById('lbStatus');

    // ---- Constants ----
    const CANVAS_W = 320;
    const CANVAS_H = 480;
    const GROUND_H = 40;
    const GRAVITY = 0.4;
    const FLAP_VELOCITY = -6.5;
    const MAX_VY = 10;
    const PIPE_W = 52;
    const PIPE_GAP = 120;
    const PIPE_SPEED = 2;
    const BIRD_R = 12;
    const BIRD_X = 60;
    const FLAP_COOLDOWN = 100;
    const CLOUD_COUNT = 5;

    const GAME = 'flappy';
    let CLOUD_AVAILABLE = false;

    // ---- Game state ----
    let state = 'START'; // 'START' | 'PLAYING' | 'GAME_OVER'
    let bird = { x: BIRD_X, y: CANVAS_H / 2, vy: 0, rotation: 0 };
    let pipes = [];
    let score = 0;
    let highScore = parseInt(localStorage.getItem('flappyHighScore')) || 0;
    let groundX = 0;
    let clouds = [];
    let lastTime = 0;
    let lastFlapTime = 0;
    let animFrameId = null;

    const getPlayerName = () => (playerNameInput.value || '匿名玩家').trim().slice(0, 12) || '匿名玩家';

    // ====================== Cloud API ======================

    async function submitScore(scoreValue) {
        if (!CLOUD_AVAILABLE) return;
        const player = getPlayerName();
        try {
            const res = await fetch('/api/score', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ game: GAME, score: scoreValue, player }),
            });
            if (!res.ok) throw new Error('HTTP ' + res.status);
            const data = await res.json();
            if (data.playerBest > highScore) {
                highScore = data.playerBest;
                localStorage.setItem('flappyHighScore', highScore);
                highScoreEl.textContent = highScore;
            }
            return data;
        } catch (err) {
            console.warn('云端存档失败:', err.message);
            return null;
        }
    }

    async function fetchLeaderboard() {
        try {
            const res = await fetch('/api/score?game=' + GAME + '&_=' + Date.now());
            if (!res.ok) throw new Error('HTTP ' + res.status);
            return await res.json();
        } catch (err) {
            console.warn('获取排行榜失败:', err.message);
            return null;
        }
    }

    async function checkCloudConnection() {
        try {
            const res = await fetch('/api/score?game=ping');
            if (res.ok || res.status === 400) {
                CLOUD_AVAILABLE = true;
                cloudBadge.textContent = '☁️ 已连接';
                cloudBadge.className = 'cloud-badge online';
                return true;
            }
            throw new Error('HTTP ' + res.status);
        } catch {
            CLOUD_AVAILABLE = false;
            cloudBadge.textContent = '☁️ 离线';
            cloudBadge.className = 'cloud-badge error';
            return false;
        }
    }

    async function renderLeaderboard() {
        lbStatus.textContent = '加载中...';
        lbList.innerHTML = '<div class="lb-empty">⏳ 获取排行榜中...</div>';

        const data = await fetchLeaderboard();
        if (!data || !data.leaderboard || data.leaderboard.length === 0) {
            lbStatus.textContent = '暂无数据';
            lbList.innerHTML = '<div class="lb-empty">🏆 还没有记录，来玩一局吧！</div>';
            return;
        }

        lbStatus.textContent = '共 ' + data.total + ' 人';

        if (data.best > highScore) {
            highScore = data.best;
            highScoreEl.textContent = highScore;
        }

        const medals = ['🥇', '🥈', '🥉'];
        const rankClasses = ['gold', 'silver', 'bronze'];

        lbList.innerHTML = data.leaderboard
            .map(function (entry, i) {
                const rank = i + 1;
                const isMe = entry.player === getPlayerName();
                const medal = i < 3 ? medals[i] : '';
                const rankClass = i < 3 ? rankClasses[i] : '';
                return (
                    '<div class="lb-row' + (isMe ? ' lb-me' : '') + '">' +
                        '<span class="lb-rank ' + rankClass + '">' + (medal || rank) + '</span>' +
                        '<span class="lb-player">' + escapeHtml(entry.player) + (isMe ? ' 👈' : '') + '</span>' +
                        '<span class="lb-score">' + entry.score + '</span>' +
                    '</div>'
                );
            })
            .join('');
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // ====================== Game Logic ======================

    function initClouds() {
        clouds = [];
        for (let i = 0; i < CLOUD_COUNT; i++) {
            clouds.push({
                x: Math.random() * CANVAS_W,
                y: 20 + Math.random() * 180,
                w: 40 + Math.random() * 70,
                h: 14 + Math.random() * 22,
                speed: 0.15 + Math.random() * 0.35,
            });
        }
    }

    function addPipe() {
        const minTop = 50;
        const maxTop = CANVAS_H - GROUND_H - PIPE_GAP - 50;
        const gapTop = minTop + Math.random() * (maxTop - minTop);
        pipes.push({
            x: CANVAS_W,
            gapTop: gapTop,
            gapBottom: gapTop + PIPE_GAP,
            passed: false,
        });
    }

    function init() {
        bird = { x: BIRD_X, y: CANVAS_H / 2, vy: 0, rotation: 0 };
        pipes = [];
        score = 0;
        groundX = 0;
        state = 'START';
        lastFlapTime = 0;
        initClouds();
        scoreEl.textContent = '0';
        highScoreEl.textContent = highScore;
        overlay.classList.remove('hidden');
        overlayContent.innerHTML =
            '<h2>🐦 Flappy Bird</h2>' +
            '<p>点击或按空格控制飞行</p>' +
            '<button id="startBtn" class="btn">开始游戏</button>';
        document.getElementById('startBtn').addEventListener('click', function (e) {
            e.stopPropagation();
            startGame();
        });
    }

    function startGame() {
        bird = { x: BIRD_X, y: CANVAS_H / 2, vy: FLAP_VELOCITY, rotation: 0 };
        pipes = [];
        score = 0;
        groundX = 0;
        lastFlapTime = 0;
        initClouds();
        addPipe();
        state = 'PLAYING';
        overlay.classList.add('hidden');
        scoreEl.textContent = '0';
        highScoreEl.textContent = highScore;
    }

    function flap() {
        const now = Date.now();
        if (now - lastFlapTime < FLAP_COOLDOWN) return;
        lastFlapTime = now;
        bird.vy = FLAP_VELOCITY;
    }

    function updateScoreUI() {
        scoreEl.textContent = score;
        if (score > highScore) {
            highScore = score;
            localStorage.setItem('flappyHighScore', highScore);
            highScoreEl.textContent = highScore;
        }
    }

    async function gameOverHandler() {
        state = 'GAME_OVER';
        const finalScore = score;
        const isNewHigh = finalScore > 0 && finalScore >= highScore;

        let cloudInfo = '';
        if (CLOUD_AVAILABLE && finalScore > 0) {
            const result = await submitScore(finalScore);
            if (result) {
                cloudInfo = '<p style="color:#7dd3fc;font-size:0.8rem;margin-top:4px">☁️ 已存档 · 排名 #' + (result.rank || '?') + '</p>';
            }
        }

        overlay.classList.remove('hidden');
        overlayContent.innerHTML =
            '<h2>💀 游戏结束</h2>' +
            '<p style="font-size:2rem;font-weight:700;color:#fbbf24;margin:10px 0">' + finalScore + ' 分</p>' +
            '<p style="color:#888;font-size:0.85rem">最高记录: ' + highScore + (isNewHigh && finalScore > 0 ? ' 🎉 新纪录！' : '') + '</p>' +
            cloudInfo +
            '<button id="restartBtn" class="btn" style="margin-top:14px">再来一局</button>';
        document.getElementById('restartBtn').addEventListener('click', function (e) {
            e.stopPropagation();
            startGame();
        });

        if (CLOUD_AVAILABLE) renderLeaderboard();
    }

    // ---- Collision: circle vs rectangle ----
    function circleRectCollision(cx, cy, cr, rx, ry, rw, rh) {
        const nearestX = Math.max(rx, Math.min(cx, rx + rw));
        const nearestY = Math.max(ry, Math.min(cy, ry + rh));
        const dx = cx - nearestX;
        const dy = cy - nearestY;
        return dx * dx + dy * dy < cr * cr;
    }

    // ---- Update ----
    function updateStart(dt) {
        const dtScale = dt / 16.67;

        // Bobbing bird
        const bob = Math.sin(Date.now() / 300) * 8;
        bird.y = CANVAS_H / 2 + bob;
        bird.rotation = 0;

        // Scrolling ground
        groundX += PIPE_SPEED * dtScale;

        // Clouds scroll slowly
        for (let i = 0; i < clouds.length; i++) {
            const c = clouds[i];
            c.x -= c.speed * dtScale;
            if (c.x + c.w < -20) {
                c.x = CANVAS_W + Math.random() * 40;
                c.y = 20 + Math.random() * 180;
            }
        }
    }

    function updatePlaying(dt) {
        const dtScale = dt / 16.67;

        // ---- Bird physics ----
        bird.vy += GRAVITY * dtScale;
        if (bird.vy > MAX_VY) bird.vy = MAX_VY;
        bird.y += bird.vy * dtScale;
        // Rotation: nose up when rising, nose down when falling
        bird.rotation = Math.min(Math.PI / 4, Math.max(-Math.PI / 4, bird.vy * 0.08));

        // ---- Pipes ----
        for (let i = 0; i < pipes.length; i++) {
            pipes[i].x -= PIPE_SPEED * dtScale;
        }

        // Remove off-screen pipes
        pipes = pipes.filter(function (p) { return p.x + PIPE_W > -50; });

        // Generate new pipes
        if (pipes.length === 0 || pipes[pipes.length - 1].x < CANVAS_W - 200) {
            addPipe();
        }

        // ---- Scoring ----
        for (let i = 0; i < pipes.length; i++) {
            const p = pipes[i];
            if (!p.passed && p.x + PIPE_W < bird.x) {
                p.passed = true;
                score++;
                updateScoreUI();
            }
        }

        // ---- Ground scroll ----
        groundX += PIPE_SPEED * dtScale;

        // ---- Clouds scroll ----
        for (let i = 0; i < clouds.length; i++) {
            const c = clouds[i];
            c.x -= c.speed * dtScale;
            if (c.x + c.w < -20) {
                c.x = CANVAS_W + Math.random() * 40;
                c.y = 20 + Math.random() * 180;
            }
        }

        // ---- Collision detection ----
        // Top boundary
        if (bird.y - BIRD_R < 0) {
            bird.y = BIRD_R;
            gameOverHandler();
            return;
        }

        // Ground
        if (bird.y + BIRD_R > CANVAS_H - GROUND_H) {
            bird.y = CANVAS_H - GROUND_H - BIRD_R;
            gameOverHandler();
            return;
        }

        // Pipe collisions
        for (let i = 0; i < pipes.length; i++) {
            const p = pipes[i];
            // Top pipe rectangle
            if (circleRectCollision(bird.x, bird.y, BIRD_R, p.x, 0, PIPE_W, p.gapTop)) {
                gameOverHandler();
                return;
            }
            // Bottom pipe rectangle
            if (circleRectCollision(bird.x, bird.y, BIRD_R, p.x, p.gapBottom, PIPE_W, CANVAS_H - GROUND_H - p.gapBottom)) {
                gameOverHandler();
                return;
            }
        }
    }

    // ====================== Drawing ======================

    function drawBackground() {
        const gradient = ctx.createLinearGradient(0, 0, 0, CANVAS_H - GROUND_H);
        gradient.addColorStop(0, '#4dc9f6');
        gradient.addColorStop(0.5, '#87CEEB');
        gradient.addColorStop(0.75, '#2d6ba0');
        gradient.addColorStop(1, '#1a1a2e');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, CANVAS_W, CANVAS_H - GROUND_H);
    }

    function drawClouds() {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        for (let i = 0; i < clouds.length; i++) {
            const c = clouds[i];
            ctx.beginPath();
            ctx.ellipse(c.x, c.y, c.w / 2, c.h / 2, 0, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    function drawGround() {
        // Main brown ground
        ctx.fillStyle = '#5D4037';
        ctx.fillRect(0, CANVAS_H - GROUND_H, CANVAS_W, GROUND_H);

        // Green grass top
        ctx.fillStyle = '#4CAF50';
        ctx.fillRect(0, CANVAS_H - GROUND_H, CANVAS_W, 5);

        // Grass highlight
        ctx.fillStyle = '#66BB6A';
        ctx.fillRect(0, CANVAS_H - GROUND_H, CANVAS_W, 2);

        // Scrolling stripe pattern
        ctx.fillStyle = 'rgba(0,0,0,0.06)';
        const scroll = groundX % 30;
        for (let x = -scroll; x < CANVAS_W; x += 30) {
            ctx.fillRect(x, CANVAS_H - GROUND_H + 7, 2, GROUND_H - 12);
        }

        // Second stripe with different offset
        ctx.fillStyle = 'rgba(0,0,0,0.04)';
        const scroll2 = (groundX * 1.3) % 45;
        for (let x = -scroll2; x < CANVAS_W; x += 45) {
            ctx.fillRect(x, CANVAS_H - GROUND_H + 16, 3, GROUND_H - 22);
        }
    }

    function drawPipe(p) {
        const capH = 22;
        const capExtra = 4;

        // ===== Top pipe =====
        // Body
        ctx.fillStyle = '#73bf2e';
        ctx.fillRect(p.x, 0, PIPE_W, p.gapTop);

        // Highlight stripe
        ctx.fillStyle = '#8bd43e';
        ctx.fillRect(p.x + 3, 0, 4, p.gapTop);

        // Shadow stripe
        ctx.fillStyle = '#5a9a24';
        ctx.fillRect(p.x + PIPE_W - 4, 0, 3, p.gapTop);

        // Border
        ctx.strokeStyle = '#558b2f';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(p.x, 0, PIPE_W, p.gapTop);

        // Top pipe cap (at the gap opening)
        ctx.fillStyle = '#558b2f';
        ctx.fillRect(p.x - capExtra, p.gapTop - capH, PIPE_W + capExtra * 2, capH);
        ctx.fillStyle = '#73bf2e';
        ctx.fillRect(p.x - capExtra + 2, p.gapTop - capH + 2, PIPE_W + capExtra * 2 - 4, capH - 4);
        ctx.fillStyle = '#8bd43e';
        ctx.fillRect(p.x - capExtra + 2, p.gapTop - capH + 2, 3, capH - 4);
        ctx.strokeStyle = '#558b2f';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(p.x - capExtra, p.gapTop - capH, PIPE_W + capExtra * 2, capH);

        // ===== Bottom pipe =====
        const bH = CANVAS_H - GROUND_H - p.gapBottom;

        // Body
        ctx.fillStyle = '#73bf2e';
        ctx.fillRect(p.x, p.gapBottom, PIPE_W, bH);

        // Highlight stripe
        ctx.fillStyle = '#8bd43e';
        ctx.fillRect(p.x + 3, p.gapBottom, 4, bH);

        // Shadow stripe
        ctx.fillStyle = '#5a9a24';
        ctx.fillRect(p.x + PIPE_W - 4, p.gapBottom, 3, bH);

        // Border
        ctx.strokeStyle = '#558b2f';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(p.x, p.gapBottom, PIPE_W, bH);

        // Bottom pipe cap (at the gap opening)
        ctx.fillStyle = '#558b2f';
        ctx.fillRect(p.x - capExtra, p.gapBottom, PIPE_W + capExtra * 2, capH);
        ctx.fillStyle = '#73bf2e';
        ctx.fillRect(p.x - capExtra + 2, p.gapBottom + 2, PIPE_W + capExtra * 2 - 4, capH - 4);
        ctx.fillStyle = '#8bd43e';
        ctx.fillRect(p.x - capExtra + 2, p.gapBottom + 2, 3, capH - 4);
        ctx.strokeStyle = '#558b2f';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(p.x - capExtra, p.gapBottom, PIPE_W + capExtra * 2, capH);
    }

    function drawPipes() {
        for (let i = 0; i < pipes.length; i++) {
            drawPipe(pipes[i]);
        }
    }

    function drawBird() {
        ctx.save();
        ctx.translate(bird.x, bird.y);
        ctx.rotate(bird.rotation);

        const r = BIRD_R;

        // Body (yellow circle)
        ctx.fillStyle = '#fdd835';
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fill();

        // Outline
        ctx.strokeStyle = '#f9a825';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Wing
        ctx.fillStyle = '#f9a825';
        ctx.beginPath();
        ctx.ellipse(-3, 4, 7, 4, -0.3, 0, Math.PI * 2);
        ctx.fill();

        // Wing detail
        ctx.fillStyle = '#f57f17';
        ctx.beginPath();
        ctx.ellipse(-4, 4, 4, 2.5, -0.3, 0, Math.PI * 2);
        ctx.fill();

        // Eye white
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(5, -3, 4.5, 0, Math.PI * 2);
        ctx.fill();

        // Eye pupil
        ctx.fillStyle = '#111';
        ctx.beginPath();
        ctx.arc(6.5, -3, 2.5, 0, Math.PI * 2);
        ctx.fill();

        // Eye highlight
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(7.5, -4.5, 1, 0, Math.PI * 2);
        ctx.fill();

        // Beak
        ctx.fillStyle = '#ff9800';
        ctx.beginPath();
        ctx.moveTo(r - 1, -1);
        ctx.lineTo(r + 8, 2);
        ctx.lineTo(r - 1, 5);
        ctx.closePath();
        ctx.fill();

        // Beak outline
        ctx.strokeStyle = '#e65100';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(r - 1, -1);
        ctx.lineTo(r + 8, 2);
        ctx.lineTo(r - 1, 5);
        ctx.closePath();
        ctx.stroke();

        ctx.restore();
    }

    function drawScore() {
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';

        // Shadow
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.font = 'bold 52px Arial, sans-serif';
        ctx.fillText(String(score), CANVAS_W / 2 + 2, 22);

        // Score
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 52px Arial, sans-serif';
        ctx.fillText(String(score), CANVAS_W / 2, 20);

        ctx.restore();
    }

    function draw() {
        drawBackground();
        drawClouds();
        drawPipes();
        drawGround();
        drawBird();

        if (state === 'PLAYING') {
            drawScore();
        }
    }

    // ====================== Input ======================

    function handleKey(e) {
        const key = e.key;
        if (key === ' ' || key === 'Space' || key === 'ArrowUp' || key === 'w' || key === 'W') {
            e.preventDefault();
            if (state === 'START') {
                startGame();
            } else if (state === 'PLAYING') {
                flap();
            } else if (state === 'GAME_OVER') {
                startGame();
            }
        }
    }

    // Root-level interaction handler for clicks/touches
    function handleRootInteraction(e) {
        // Skip interactive elements
        if (e.target.closest('.btn') || e.target.closest('input') || e.target.closest('.back-btn')) return;

        // Only respond to interactions inside the game area (canvas wrapper / overlay)
        if (!e.target.closest('.canvas-wrapper') && !e.target.closest('#overlay')) return;

        if (e.type === 'touchstart') {
            e.preventDefault(); // Prevent scrolling
        }

        if (state === 'START') {
            startGame();
        } else if (state === 'PLAYING') {
            flap();
        } else if (state === 'GAME_OVER') {
            startGame();
        }
    }

    // ====================== Game Loop ======================

    function gameLoop(timestamp) {
        if (!lastTime) lastTime = timestamp;
        const dt = Math.min(timestamp - lastTime, 33); // Cap at ~30fps
        lastTime = timestamp;

        if (state === 'START') {
            updateStart(dt);
        } else if (state === 'PLAYING') {
            updatePlaying(dt);
        }

        draw();

        animFrameId = requestAnimationFrame(gameLoop);
    }

    // ====================== roundRect polyfill ======================
    if (!CanvasRenderingContext2D.prototype.roundRect) {
        CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
            if (r > w / 2) r = w / 2;
            if (r > h / 2) r = h / 2;
            this.moveTo(x + r, y);
            this.lineTo(x + w - r, y);
            this.quadraticCurveTo(x + w, y, x + w, y + r);
            this.lineTo(x + w, y + h - r);
            this.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
            this.lineTo(x + r, y + h);
            this.quadraticCurveTo(x, y + h, x, y + h - r);
            this.lineTo(x, y + r);
            this.quadraticCurveTo(x, y, x + r, y);
            return this;
        };
    }

    // ====================== Bootstrap ======================

    // Load saved nickname
    const savedName = localStorage.getItem('flappyPlayerName');
    if (savedName) playerNameInput.value = savedName;
    playerNameInput.addEventListener('input', function () {
        localStorage.setItem('flappyPlayerName', playerNameInput.value);
    });

    highScoreEl.textContent = highScore;
    init();

    // Input
    document.addEventListener('keydown', handleKey);
    document.addEventListener('click', handleRootInteraction);
    document.addEventListener('touchstart', handleRootInteraction, { passive: false });

    // Start game loop
    animFrameId = requestAnimationFrame(gameLoop);

    // Cloud connection
    checkCloudConnection().then(function (connected) {
        if (connected) {
            renderLeaderboard();
            setInterval(renderLeaderboard, 60000);
        } else {
            lbStatus.textContent = '离线模式';
            lbList.innerHTML = '<div class="lb-empty">☁️ 未连接到云端，分数仅保存在本地</div>';
        }
    });
})();
