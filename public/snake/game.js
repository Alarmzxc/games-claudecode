(function () {
    'use strict';

    // ---- DOM refs ----
    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');
    const scoreEl = document.getElementById('score');
    const highScoreEl = document.getElementById('highScore');
    const speedEl = document.getElementById('speed');
    const speedMaxEl = document.getElementById('speedMax');
    const speedFill = document.getElementById('speedFill');
    const speedLabel = document.getElementById('speedLabel');
    const overlay = document.getElementById('overlay');
    const overlayContent = document.getElementById('overlayContent');
    const startBtn = document.getElementById('startBtn');
    const playerNameInput = document.getElementById('playerName');
    const cloudBadge = document.getElementById('cloudBadge');
    const lbList = document.getElementById('lbList');
    const lbStatus = document.getElementById('lbStatus');

    // ---- Constants ----
    const GRID_SIZE = 20;
    const TILE_COUNT = canvas.width / GRID_SIZE;
    const BASE_INTERVAL = 160;
    const MIN_INTERVAL = 50;
    const SPEED_STEP = 8;
    const FOOD_PER_LEVEL = 3;
    const MAX_SPEED_LEVEL = Math.floor((BASE_INTERVAL - MIN_INTERVAL) / SPEED_STEP) + 1;

    const SPEED_LABELS = [
        '慢速', '龟速', '步行', '小跑', '快走',
        '跑步', '冲刺', '飙车', '火箭', '闪电',
        '光速', '瞬移', '超越', '极限', '？？？',
    ];

    const GAME = 'snake';
    let CLOUD_AVAILABLE = false;

    // ---- Game state ----
    let snake = [];
    let food = {};
    let direction = { x: 1, y: 0 };
    let directionQueue = [];
    let score = 0;
    let highScore = parseInt(localStorage.getItem('snakeHighScore')) || 0;
    let gameRunning = false;
    let gameOver = false;
    let paused = false;
    let gameLoop = null;
    let speedLevel = 1;

    // ---- Direction helpers ----
    const DIRS = {
        ArrowUp: { x: 0, y: -1 },
        ArrowDown: { x: 0, y: 1 },
        ArrowLeft: { x: -1, y: 0 },
        ArrowRight: { x: 1, y: 0 },
        w: { x: 0, y: -1 },
        W: { x: 0, y: -1 },
        s: { x: 0, y: 1 },
        S: { x: 0, y: 1 },
        a: { x: -1, y: 0 },
        A: { x: -1, y: 0 },
        d: { x: 1, y: 0 },
        D: { x: 1, y: 0 },
    };

    const isOpposite = (d1, d2) => d1.x + d2.x === 0 && d1.y + d2.y === 0;
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
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            // 如果云端有更高分，更新本地最高分
            if (data.playerBest > highScore) {
                highScore = data.playerBest;
                localStorage.setItem('snakeHighScore', highScore);
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
            const res = await fetch(`/api/score?game=${GAME}&_=${Date.now()}`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            return data;
        } catch (err) {
            console.warn('获取排行榜失败:', err.message);
            return null;
        }
    }

    async function checkCloudConnection() {
        try {
            const res = await fetch('/api/score?game=ping');
            if (res.ok || res.status === 400) { // 400 是参数校验失败但 API 活着
                CLOUD_AVAILABLE = true;
                cloudBadge.textContent = '☁️ 已连接';
                cloudBadge.className = 'cloud-badge online';
                return true;
            }
            throw new Error(`HTTP ${res.status}`);
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

        lbStatus.textContent = `共 ${data.total} 人`;

        if (data.best > highScore) {
            highScore = data.best;
            highScoreEl.textContent = highScore;
        }

        const medals = ['🥇', '🥈', '🥉'];
        const rankClasses = ['gold', 'silver', 'bronze'];

        lbList.innerHTML = data.leaderboard
            .map((entry, i) => {
                const rank = i + 1;
                const isMe = entry.player === getPlayerName();
                const medal = i < 3 ? medals[i] : '';
                const rankClass = i < 3 ? rankClasses[i] : '';
                return `
                    <div class="lb-row${isMe ? ' lb-me' : ''}">
                        <span class="lb-rank ${rankClass}">${medal || rank}</span>
                        <span class="lb-player">${escapeHtml(entry.player)}${isMe ? ' 👈' : ''}</span>
                        <span class="lb-score">${entry.score}</span>
                    </div>
                `;
            })
            .join('');
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // ====================== Game Logic ======================

    function init() {
        snake = [
            { x: 5, y: 10 },
            { x: 4, y: 10 },
            { x: 3, y: 10 },
        ];
        direction = { x: 1, y: 0 };
        directionQueue = [];
        score = 0;
        speedLevel = 1;
        gameOver = false;
        paused = false;

        speedMaxEl.textContent = MAX_SPEED_LEVEL;
        highScoreEl.textContent = highScore;
        updateUI();
        updateSpeedDisplay();
        spawnFood();
        draw();
    }

    function spawnFood() {
        const free = [];
        for (let x = 0; x < TILE_COUNT; x++) {
            for (let y = 0; y < TILE_COUNT; y++) {
                if (!snake.some(s => s.x === x && s.y === y)) {
                    free.push({ x, y });
                }
            }
        }
        if (free.length === 0) return;
        food = free[Math.floor(Math.random() * free.length)];
    }

    function update() {
        if (paused || gameOver) return;

        // 从方向队列取下一个方向
        if (directionQueue.length > 0) {
            const nextDir = directionQueue.shift();
            if (!isOpposite(nextDir, direction)) {
                direction = nextDir;
            }
        }

        const head = {
            x: snake[0].x + direction.x,
            y: snake[0].y + direction.y,
        };

        if (head.x < 0 || head.x >= TILE_COUNT || head.y < 0 || head.y >= TILE_COUNT) {
            endGame('💥 撞墙了！');
            return;
        }

        if (snake.some(s => s.x === head.x && s.y === head.y)) {
            endGame('😵 咬到自己了！');
            return;
        }

        snake.unshift(head);

        if (head.x === food.x && head.y === food.y) {
            score++;
            updateUI();

            const newLevel = Math.floor(score / FOOD_PER_LEVEL) + 1;
            if (newLevel !== speedLevel) {
                speedLevel = Math.min(newLevel, MAX_SPEED_LEVEL);
                updateSpeedDisplay();
                resetTimer();
            }

            spawnFood();
        } else {
            snake.pop();
        }

        draw();
    }

    // ---- Draw ----
    function draw() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Grid
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
        ctx.lineWidth = 1;
        for (let i = 0; i <= TILE_COUNT; i++) {
            ctx.beginPath();
            ctx.moveTo(i * GRID_SIZE, 0);
            ctx.lineTo(i * GRID_SIZE, canvas.height);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(0, i * GRID_SIZE);
            ctx.lineTo(canvas.width, i * GRID_SIZE);
            ctx.stroke();
        }

        // Snake
        snake.forEach((seg, i) => {
            const ratio = i / snake.length;
            const size = GRID_SIZE - 2;
            const pad = (GRID_SIZE - size) / 2;
            const x = seg.x * GRID_SIZE + pad;
            const y = seg.y * GRID_SIZE + pad;

            if (i === 0) {
                const r = 4;
                ctx.fillStyle = '#4ade80';
                ctx.beginPath();
                ctx.moveTo(x + r, y);
                ctx.lineTo(x + size - r, y);
                ctx.quadraticCurveTo(x + size, y, x + size, y + r);
                ctx.lineTo(x + size, y + size - r);
                ctx.quadraticCurveTo(x + size, y + size, x + size - r, y + size);
                ctx.lineTo(x + r, y + size);
                ctx.quadraticCurveTo(x, y + size, x, y + size - r);
                ctx.lineTo(x, y + r);
                ctx.quadraticCurveTo(x, y, x + r, y);
                ctx.closePath();
                ctx.fill();

                const cx = seg.x * GRID_SIZE + GRID_SIZE / 2;
                const cy = seg.y * GRID_SIZE + GRID_SIZE / 2;
                const eo = 4;
                ctx.fillStyle = '#fff';
                ctx.beginPath();
                ctx.arc(cx - eo, cy - eo, 3, 0, Math.PI * 2);
                ctx.arc(cx + eo, cy - eo, 3, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = '#111';
                ctx.beginPath();
                ctx.arc(cx - eo + direction.x, cy - eo + direction.y, 1.4, 0, Math.PI * 2);
                ctx.arc(cx + eo + direction.x, cy - eo + direction.y, 1.4, 0, Math.PI * 2);
                ctx.fill();
            } else {
                const t = ratio;
                const r = Math.round(30 + (1 - t) * 50);
                const g = Math.round(120 + (1 - t) * 80);
                const b = Math.round(60 + (1 - t) * 30);
                ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
                ctx.beginPath();
                ctx.roundRect(x, y, size, size, 3);
                ctx.fill();
            }
        });

        // Food
        const fx = food.x * GRID_SIZE + GRID_SIZE / 2;
        const fy = food.y * GRID_SIZE + GRID_SIZE / 2;
        const pulse = 4 + Math.sin(performance.now() / 180) * 1.2;
        const fr = GRID_SIZE / 2 - 2;

        const glow = ctx.createRadialGradient(fx, fy, 0, fx, fy, fr + pulse);
        glow.addColorStop(0, 'rgba(255, 80, 50, 0.5)');
        glow.addColorStop(1, 'rgba(255, 50, 50, 0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(fx, fy, fr + pulse, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#ff4444';
        ctx.beginPath();
        ctx.arc(fx, fy, fr, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.beginPath();
        ctx.arc(fx - 2.5, fy - 2.5, fr * 0.35, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = '#4a7c3f';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(fx, fy - fr + 1);
        ctx.lineTo(fx + 2, fy - fr - 4);
        ctx.stroke();

        ctx.fillStyle = '#5a9c4f';
        ctx.beginPath();
        ctx.ellipse(fx + 4, fy - fr - 1, 4, 2.5, 0.4, 0, Math.PI * 2);
        ctx.fill();
    }

    // ---- Game loop ----
    function getInterval() {
        const interval = BASE_INTERVAL - (speedLevel - 1) * SPEED_STEP;
        return Math.max(interval, MIN_INTERVAL);
    }

    function resetTimer() {
        if (gameLoop) { clearInterval(gameLoop); gameLoop = null; }
        if (gameRunning && !gameOver) {
            gameLoop = setInterval(update, getInterval());
        }
    }

    function updateSpeedDisplay() {
        speedEl.textContent = speedLevel;
        const pct = ((speedLevel - 1) / (MAX_SPEED_LEVEL - 1)) * 100;
        speedFill.style.width = `${pct}%`;
        const idx = Math.min(speedLevel - 1, SPEED_LABELS.length - 1);
        speedLabel.textContent = SPEED_LABELS[idx];
    }

    function updateUI() {
        scoreEl.textContent = score;
        if (score > highScore) {
            highScore = score;
            localStorage.setItem('snakeHighScore', highScore);
            highScoreEl.textContent = highScore;
        }
    }

    function startGame() {
        init();
        gameRunning = true;
        overlay.classList.add('hidden');
        if (gameLoop) clearInterval(gameLoop);
        gameLoop = setInterval(update, getInterval());
    }

    async function endGame(reason) {
        gameRunning = false;
        gameOver = true;
        if (gameLoop) { clearInterval(gameLoop); gameLoop = null; }
        draw();

        const finalScore = score;
        const isNewHigh = finalScore > 0 && finalScore >= highScore;

        // 异步提交云端
        let cloudInfo = '';
        if (CLOUD_AVAILABLE && finalScore > 0) {
            const result = await submitScore(finalScore);
            if (result) {
                cloudInfo = `<p style="color:#7dd3fc;font-size:0.8rem;margin-top:4px">☁️ 已存档 · 排名 #${result.rank || '?'}</p>`;
            }
        }

        overlay.classList.remove('hidden');
        overlayContent.innerHTML = `
            <h2>💀 游戏结束</h2>
            <p>${reason}</p>
            <p style="font-size:2rem;font-weight:700;color:#fbbf24;margin:10px 0">${finalScore} 分</p>
            <p style="color:#888;font-size:0.85rem">最高记录: ${highScore}${isNewHigh && finalScore > 0 ? ' 🎉 新纪录！' : ''}</p>
            ${cloudInfo}
            <button id="restartBtn" class="btn" style="margin-top:14px">再来一局</button>
        `;
        document.getElementById('restartBtn').addEventListener('click', startGame);

        // 刷新排行榜
        if (CLOUD_AVAILABLE) renderLeaderboard();
    }

    function togglePause() {
        if (!gameRunning || gameOver) return;
        paused = !paused;
        if (paused) {
            overlay.classList.remove('hidden');
            overlayContent.innerHTML = `
                <h2>⏸️ 已暂停</h2>
                <p style="margin-top:8px">按 <kbd style="background:rgba(255,255,255,0.1);padding:2px 8px;border-radius:4px;min-width:auto">Space</kbd> 继续</p>
            `;
        } else {
            overlay.classList.add('hidden');
        }
    }

    // ---- Input ----
    function handleKey(e) {
        const key = e.key;

        if (key === ' ' || key === 'Space') {
            e.preventDefault();
            if (!gameRunning) startGame();
            else togglePause();
            return;
        }

        if (key === 'Enter' && !gameRunning) {
            startGame();
            return;
        }

        const dir = DIRS[key];
        if (dir && gameRunning && !paused) {
            e.preventDefault();
            // 防反向：与当前方向比较，并与队列末尾方向比较
            const lastQueued = directionQueue.length > 0 ? directionQueue[directionQueue.length - 1] : direction;
            if (!isOpposite(dir, lastQueued) && directionQueue.length < 3) {
                directionQueue.push({ ...dir });
            }
        }
    }

    // ---- Touch controls ----
    function setupTouchControls() {
        const dirMap = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } };
        document.querySelectorAll('.touch-btn').forEach(btn => {
            const dir = dirMap[btn.dataset.dir];
            if (!dir) return;
            const handler = (e) => {
                e.preventDefault();
                if (!gameRunning) { startGame(); return; }
                if (paused) return;
                const lastQueued = directionQueue.length > 0 ? directionQueue[directionQueue.length - 1] : direction;
                if (!isOpposite(dir, lastQueued) && directionQueue.length < 3) {
                    directionQueue.push({ ...dir });
                }
            };
            btn.addEventListener('touchstart', handler, { passive: false });
            btn.addEventListener('mousedown', handler);
        });
    }

    // ---- Swipe ----
    let touchStart = null;
    function setupSwipe() {
        canvas.addEventListener('touchstart', (e) => {
            const t = e.touches[0];
            touchStart = { x: t.clientX, y: t.clientY };
        }, { passive: true });

        canvas.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });

        canvas.addEventListener('touchend', (e) => {
            if (!touchStart) return;
            if (!gameRunning) { startGame(); touchStart = null; return; }
            if (paused) return;
            const t = e.changedTouches[0];
            const dx = t.clientX - touchStart.x;
            const dy = t.clientY - touchStart.y;
            touchStart = null;
            const absDx = Math.abs(dx);
            const absDy = Math.abs(dy);
            if (Math.max(absDx, absDy) < 20) return;
            let dir;
            if (absDx > absDy) dir = dx > 0 ? { x: 1, y: 0 } : { x: -1, y: 0 };
            else dir = dy > 0 ? { x: 0, y: 1 } : { x: 0, y: -1 };
            if (!isOpposite(dir, direction) && directionQueue.length < 3) {
                directionQueue.push(dir);
            }
        }, { passive: true });
    }

    // ---- roundRect polyfill ----
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

    // 加载存储的昵称
    const savedName = localStorage.getItem('snakePlayerName');
    if (savedName) playerNameInput.value = savedName;
    playerNameInput.addEventListener('input', () => {
        localStorage.setItem('snakePlayerName', playerNameInput.value);
    });

    highScoreEl.textContent = highScore;
    speedMaxEl.textContent = MAX_SPEED_LEVEL;
    init();
    updateSpeedDisplay();
    setupTouchControls();
    setupSwipe();

    document.addEventListener('keydown', handleKey);
    startBtn.addEventListener('click', startGame);

    // 检测云端连接并加载排行榜
    checkCloudConnection().then(connected => {
        if (connected) {
            renderLeaderboard();
            // 每 60 秒自动刷新排行榜
            setInterval(renderLeaderboard, 60000);
        } else {
            lbStatus.textContent = '离线模式';
            lbList.innerHTML = '<div class="lb-empty">☁️ 未连接到云端，分数仅保存在本地</div>';
        }
    });
})();
