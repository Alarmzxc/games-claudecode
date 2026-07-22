(function () {
    'use strict';

    // ====================== DOM Refs ======================
    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');
    const nextCanvas = document.getElementById('nextCanvas');
    const nextCtx = nextCanvas.getContext('2d');
    const scoreEl = document.getElementById('score');
    const linesEl = document.getElementById('lines');
    const levelEl = document.getElementById('level');
    const highScoreEl = document.getElementById('highScore');
    const levelFill = document.getElementById('levelFill');
    const levelLabel = document.getElementById('levelLabel');
    const overlay = document.getElementById('overlay');
    const overlayContent = document.getElementById('overlayContent');
    const startBtn = document.getElementById('startBtn');
    const playerNameInput = document.getElementById('playerName');
    const cloudBadge = document.getElementById('cloudBadge');
    const lbList = document.getElementById('lbList');
    const lbStatus = document.getElementById('lbStatus');

    // ====================== Constants ======================
    const COLS = 10;
    const ROWS = 20;
    const CELL_SIZE = 25;

    const GAME = 'tetris';

    // 7-bag 方块定义（矩阵 + 颜色）
    const PIECES = {
        I: {
            shape: [
                [0, 0, 0, 0],
                [1, 1, 1, 1],
                [0, 0, 0, 0],
                [0, 0, 0, 0],
            ],
            color: '#00d4ff',
        },
        O: {
            shape: [
                [1, 1],
                [1, 1],
            ],
            color: '#ffd600',
        },
        T: {
            shape: [
                [0, 1, 0],
                [1, 1, 1],
                [0, 0, 0],
            ],
            color: '#bb86fc',
        },
        S: {
            shape: [
                [0, 1, 1],
                [1, 1, 0],
                [0, 0, 0],
            ],
            color: '#69f0ae',
        },
        Z: {
            shape: [
                [1, 1, 0],
                [0, 1, 1],
                [0, 0, 0],
            ],
            color: '#ff5252',
        },
        J: {
            shape: [
                [1, 0, 0],
                [1, 1, 1],
                [0, 0, 0],
            ],
            color: '#448aff',
        },
        L: {
            shape: [
                [0, 0, 1],
                [1, 1, 1],
                [0, 0, 0],
            ],
            color: '#ffab40',
        },
    };

    const PIECE_KEYS = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];

    // 等级速度表（毫秒/格）
    const LEVEL_SPEEDS = [
        800, 720, 630, 550, 470, 380, 300,
        220, 160, 120, 100, 80, 70, 60, 50,
    ];
    const MAX_LEVEL = LEVEL_SPEEDS.length;

    // 消行计分（乘以等级）
    const LINE_SCORES = [0, 100, 300, 500, 800];

    // ---- Game state ----
    let board = [];
    let currentPiece = null;
    let nextPiece = null;
    let bag = [];
    let score = 0;
    let lines = 0;
    let level = 1;
    let highScore = parseInt(localStorage.getItem('tetrisHighScore')) || 0;
    let gameRunning = false;
    let gameOver = false;
    let paused = false;
    let lastDropTime = 0;
    let dropInterval = LEVEL_SPEEDS[0];
    let animationId = null;
    let dasTimer = null;
    let dasDirection = 0; // -1 left, 1 right, 0 none
    let dasDelay = 170;   // ms before auto-repeat starts
    let dasRepeat = 50;   // ms between auto-repeat moves
    let softDropping = false;

    let CLOUD_AVAILABLE = false;

    // ====================== Utility ======================

    function getPlayerName() {
        return (playerNameInput.value || '匿名玩家').trim().slice(0, 12) || '匿名玩家';
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // 矩阵顺时针旋转 90°
    function rotateMatrix(matrix) {
        const N = matrix.length;
        const result = Array.from({ length: N }, () => Array(N).fill(0));
        for (let y = 0; y < N; y++) {
            for (let x = 0; x < N; x++) {
                result[x][N - 1 - y] = matrix[y][x];
            }
        }
        return result;
    }

    // 深拷贝矩阵
    function cloneMatrix(matrix) {
        return matrix.map(row => [...row]);
    }

    // 7-bag 随机发生器（洗牌）
    function shuffleBag() {
        const arr = [...PIECE_KEYS];
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    }

    function getNextFromBag() {
        if (bag.length === 0) {
            bag = shuffleBag();
        }
        return bag.pop();
    }

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
            if (data.playerBest > highScore) {
                highScore = data.playerBest;
                localStorage.setItem('tetrisHighScore', highScore);
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

    // ====================== Board ======================

    function createBoard() {
        board = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
    }

    function isCollision(shape, posX, posY) {
        for (let y = 0; y < shape.length; y++) {
            for (let x = 0; x < shape[y].length; x++) {
                if (shape[y][x]) {
                    const bx = posX + x;
                    const by = posY + y;
                    if (bx < 0 || bx >= COLS || by >= ROWS) return true;
                    if (by < 0) continue; // 允许在顶部分配
                    if (board[by][bx] !== null) return true;
                }
            }
        }
        return false;
    }

    function lockPiece() {
        if (!currentPiece) return;
        stopDAS();
        const { shape, x, y, color } = currentPiece;
        for (let py = 0; py < shape.length; py++) {
            for (let px = 0; px < shape[py].length; px++) {
                if (shape[py][px]) {
                    const by = y + py;
                    const bx = x + px;
                    if (by >= 0 && by < ROWS && bx >= 0 && bx < COLS) {
                        board[by][bx] = color;
                    }
                }
            }
        }

        // 检查消行
        clearLines();

        // 生成下一个方块
        spawnNewPiece();
    }

    function clearLines() {
        let cleared = 0;
        for (let y = ROWS - 1; y >= 0; y--) {
            if (board[y].every(cell => cell !== null)) {
                board.splice(y, 1);
                board.unshift(Array(COLS).fill(null));
                cleared++;
                y++; // 重新检查当前行
            }
        }

        if (cleared > 0) {
            // 计分
            const addScore = (LINE_SCORES[cleared] || 0) * level;
            score += addScore;
            lines += cleared;

            // 等级升级（每 10 行）
            const newLevel = Math.min(Math.floor(lines / 10) + 1, MAX_LEVEL);
            if (newLevel !== level) {
                level = newLevel;
                dropInterval = LEVEL_SPEEDS[Math.min(level - 1, LEVEL_SPEEDS.length - 1)];
                updateLevelDisplay();
            }

            updateUI();
        }
    }

    function spawnNewPiece() {
        const piece = nextPiece || getNextFromBag();
        const key = piece;
        const def = PIECES[key];
        const shape = cloneMatrix(def.shape);
        const startX = Math.floor((COLS - shape[0].length) / 2);
        const startY = key === 'I' ? -1 : 0;

        currentPiece = {
            key,
            shape,
            color: def.color,
            x: startX,
            y: startY,
        };

        nextPiece = getNextFromBag();
        drawNextPiece();
        lastDropTime = performance.now();

        // 检查游戏结束
        if (isCollision(currentPiece.shape, currentPiece.x, currentPiece.y)) {
            endGame('🧱 方块堆到顶了！');
        }
    }

    // ====================== Movement ======================

    function movePiece(dx, dy) {
        if (!currentPiece || !gameRunning || paused || gameOver) return false;
        if (isCollision(currentPiece.shape, currentPiece.x + dx, currentPiece.y + dy)) {
            if (dy > 0) {
                // 向下碰撞 → 固定
                lockPiece();
            }
            return false;
        }
        currentPiece.x += dx;
        currentPiece.y += dy;
        return true;
    }

    function rotatePiece() {
        if (!currentPiece || !gameRunning || paused || gameOver) return;
        if (currentPiece.key === 'O') return; // O 不旋转

        const oldShape = currentPiece.shape;
        const newShape = rotateMatrix(oldShape);

        // 尝试基本旋转
        const kicks = [
            { x: 0, y: 0 },  // 原位
            { x: -1, y: 0 }, // 左移 1
            { x: 1, y: 0 },  // 右移 1
            { x: 0, y: -1 }, // 上移 1
            { x: -2, y: 0 }, // 左移 2（I 字常用）
            { x: 2, y: 0 },  // 右移 2（I 字常用）
            { x: 0, y: -2 }, // 上移 2
        ];

        for (const kick of kicks) {
            if (!isCollision(newShape, currentPiece.x + kick.x, currentPiece.y + kick.y)) {
                currentPiece.shape = newShape;
                currentPiece.x += kick.x;
                currentPiece.y += kick.y;
                return;
            }
        }
    }

    function hardDrop() {
        if (!currentPiece || !gameRunning || paused || gameOver) return;
        let dropDist = 0;
        while (!isCollision(currentPiece.shape, currentPiece.x, currentPiece.y + 1)) {
            currentPiece.y++;
            dropDist++;
        }
        score += dropDist * 2; // 硬降奖励（每格 2 分）
        updateUI();
        stopDAS();
        lockPiece();
        lastDropTime = performance.now();
    }

    function getGhostY() {
        if (!currentPiece) return 0;
        let gy = currentPiece.y;
        while (!isCollision(currentPiece.shape, currentPiece.x, gy + 1)) {
            gy++;
        }
        return gy;
    }

    // ====================== DAS (Delayed Auto Shift) ======================

    function startDAS(dir) {
        stopDAS();
        if (!currentPiece || !gameRunning || paused || gameOver) return;
        dasDirection = dir;
        // 立即移动一次
        movePiece(dir, 0);
        // 延迟后开始自动重复
        dasTimer = setTimeout(() => {
            if (!gameRunning || paused || gameOver) { stopDAS(); return; }
            dasTimer = setInterval(() => {
                if (!currentPiece || !gameRunning || paused || gameOver) { stopDAS(); return; }
                movePiece(dasDirection, 0);
            }, dasRepeat);
        }, dasDelay);
    }

    function stopDAS() {
        dasDirection = 0;
        if (dasTimer) {
            clearTimeout(dasTimer);
            clearInterval(dasTimer);
            dasTimer = null;
        }
    }

    // ====================== UI Updates ======================

    function updateUI() {
        scoreEl.textContent = score;
        linesEl.textContent = lines;
        if (score > highScore) {
            highScore = score;
            localStorage.setItem('tetrisHighScore', highScore);
            highScoreEl.textContent = highScore;
        }
    }

    function updateLevelDisplay() {
        levelEl.textContent = level;
        const pct = ((level - 1) / (MAX_LEVEL - 1)) * 100;
        levelFill.style.width = `${pct}%`;
        levelLabel.textContent = `等级 ${level}`;
    }

    // ====================== Drawing ======================

    function drawBoard() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // 网格线
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
        ctx.lineWidth = 1;
        for (let i = 0; i <= COLS; i++) {
            ctx.beginPath();
            ctx.moveTo(i * CELL_SIZE, 0);
            ctx.lineTo(i * CELL_SIZE, canvas.height);
            ctx.stroke();
        }
        for (let i = 0; i <= ROWS; i++) {
            ctx.beginPath();
            ctx.moveTo(0, i * CELL_SIZE);
            ctx.lineTo(canvas.width, i * CELL_SIZE);
            ctx.stroke();
        }

        // 已固定的方块
        for (let y = 0; y < ROWS; y++) {
            for (let x = 0; x < COLS; x++) {
                const color = board[y][x];
                if (color) {
                    drawBlock(ctx, x * CELL_SIZE, y * CELL_SIZE, color);
                }
            }
        }

        // 幽灵方块（落点预览）
        if (currentPiece && gameRunning && !gameOver) {
            const ghostY = getGhostY();
            if (ghostY !== currentPiece.y) {
                const { shape, x, color } = currentPiece;
                for (let py = 0; py < shape.length; py++) {
                    for (let px = 0; px < shape[py].length; px++) {
                        if (shape[py][px]) {
                            const bx = (x + px) * CELL_SIZE;
                            const by = (ghostY + py) * CELL_SIZE;
                            drawGhostBlock(ctx, bx, by, color);
                        }
                    }
                }
            }
        }

        // 当前方块
        if (currentPiece && gameRunning && !gameOver) {
            const { shape, x, y, color } = currentPiece;
            for (let py = 0; py < shape.length; py++) {
                for (let px = 0; px < shape[py].length; px++) {
                    if (shape[py][px]) {
                        const bx = (x + px) * CELL_SIZE;
                        const by = (y + py) * CELL_SIZE;
                        drawBlock(ctx, bx, by, color);
                    }
                }
            }
        }
    }

    function drawBlock(context, x, y, color, size) {
        const s = size || CELL_SIZE;
        const pad = 1;
        const r = 3;

        // 主体
        context.fillStyle = color;
        context.beginPath();
        context.roundRect(x + pad, y + pad, s - pad * 2, s - pad * 2, r);
        context.fill();

        // 高光（左上）
        context.fillStyle = 'rgba(255, 255, 255, 0.2)';
        context.beginPath();
        context.roundRect(x + pad + 2, y + pad + 2, s * 0.5, s * 0.3, r);
        context.fill();

        // 暗角（右下）
        context.fillStyle = 'rgba(0, 0, 0, 0.15)';
        context.beginPath();
        context.roundRect(x + s * 0.45, y + s * 0.55, s * 0.5, s * 0.35, r);
        context.fill();
    }

    function drawGhostBlock(context, x, y, color) {
        const s = CELL_SIZE;
        const pad = 1;
        const r = 3;

        context.fillStyle = color + '30'; // 低透明度
        context.beginPath();
        context.roundRect(x + pad, y + pad, s - pad * 2, s - pad * 2, r);
        context.fill();

        context.strokeStyle = color + '60';
        context.lineWidth = 1;
        context.beginPath();
        context.roundRect(x + pad + 0.5, y + pad + 0.5, s - pad * 2 - 1, s - pad * 2 - 1, r);
        context.stroke();
    }

    function drawNextPiece() {
        const s = 25; // 预览格大小
        nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);

        if (!nextPiece) return;
        const def = PIECES[nextPiece];
        const shape = def.shape;
        const rows = shape.length;
        const cols = shape[0].length;

        // 居中计算
        const offsetX = (4 - cols) * s / 2;
        const offsetY = (4 - rows) * s / 2;

        for (let y = 0; y < rows; y++) {
            for (let x = 0; x < cols; x++) {
                if (shape[y][x]) {
                    const bx = offsetX + x * s;
                    const by = offsetY + y * s;
                    drawBlock(nextCtx, bx, by, def.color, s);
                }
            }
        }
    }

    // ====================== Game Loop ======================

    function gameLoop(timestamp) {
        if (!gameRunning || gameOver) {
            return;
        }

        if (!paused) {
            const interval = softDropping ? 50 : dropInterval;
            if (timestamp - lastDropTime >= interval) {
                movePiece(0, 1);
                lastDropTime = timestamp;
            }
            drawBoard();
        }

        animationId = requestAnimationFrame(gameLoop);
    }

    // ====================== Game State ======================

    function init() {
        createBoard();
        bag = [];
        score = 0;
        lines = 0;
        level = 1;
        dropInterval = LEVEL_SPEEDS[0];
        gameOver = false;
        paused = false;
        softDropping = false;
        currentPiece = null;
        nextPiece = null;

        highScoreEl.textContent = highScore;
        updateUI();
        updateLevelDisplay();
        drawBoard();
        drawNextPiece();
    }

    function startGame() {
        init();
        gameRunning = true;
        lastDropTime = performance.now();

        // 生成第一组方块
        nextPiece = getNextFromBag();
        spawnNewPiece();
        drawNextPiece();
        drawBoard();

        overlay.classList.add('hidden');

        if (animationId) cancelAnimationFrame(animationId);
        animationId = requestAnimationFrame(gameLoop);
    }

    async function endGame(reason) {
        gameRunning = false;
        gameOver = true;
        if (animationId) { cancelAnimationFrame(animationId); animationId = null; }
        stopDAS();
        drawBoard();

        const finalScore = score;
        const isNewHigh = finalScore > 0 && finalScore >= highScore;

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
            <p style="color:#888;font-size:0.85rem">
                行数 ${lines} · 等级 ${level}
                ${isNewHigh && finalScore > 0 ? '<br>🎉 新纪录！' : ''}
            </p>
            ${cloudInfo}
            <button id="restartBtn" class="btn" style="margin-top:14px">再来一局</button>
        `;
        document.getElementById('restartBtn').addEventListener('click', startGame);

        if (CLOUD_AVAILABLE) renderLeaderboard();
    }

    function togglePause() {
        if (!gameRunning || gameOver) return;
        paused = !paused;
        if (paused) {
            stopDAS();
            overlay.classList.remove('hidden');
            overlayContent.innerHTML = `
                <h2>⏸️ 已暂停</h2>
                <p style="margin-top:8px">按 <kbd style="background:rgba(255,255,255,0.1);padding:2px 8px;border-radius:4px;min-width:auto">P</kbd> 继续</p>
            `;
        } else {
            lastDropTime = performance.now();
            overlay.classList.add('hidden');
        }
    }

    // ====================== Input ======================

    const KEY_DIRS = {
        ArrowLeft: -1,
        ArrowRight: 1,
        a: -1, A: -1,
        d: 1, D: 1,
    };

    function handleKeyDown(e) {
        const key = e.key;

        // 开始 / 暂停
        if (key === 'p' || key === 'P') {
            e.preventDefault();
            if (!gameRunning) startGame();
            else togglePause();
            return;
        }

        if (key === ' ' || key === 'Space') {
            e.preventDefault();
            if (!gameRunning) { startGame(); return; }
            if (!paused && !gameOver) hardDrop();
            return;
        }

        if (key === 'Enter' && !gameRunning) {
            startGame();
            return;
        }

        if (!gameRunning || paused || gameOver) return;

        // 旋转
        if (key === 'ArrowUp' || key === 'w' || key === 'W') {
            e.preventDefault();
            rotatePiece();
            return;
        }

        // 左右移动（带 DAS）
        const dir = KEY_DIRS[key];
        if (dir !== undefined) {
            e.preventDefault();
            startDAS(dir);
            return;
        }

        // 软降
        if (key === 'ArrowDown' || key === 's' || key === 'S') {
            e.preventDefault();
            softDropping = true;
            movePiece(0, 1);
            return;
        }
    }

    function handleKeyUp(e) {
        const key = e.key;
        const dir = KEY_DIRS[key];
        if (dir !== undefined) {
            e.preventDefault();
            if (dasDirection === dir) stopDAS();
            return;
        }
        if (key === 'ArrowDown' || key === 's' || key === 'S') {
            softDropping = false;
        }
    }

    // ---- Touch controls ----
    function setupTouchControls() {
        const actionMap = {
            left: () => movePiece(-1, 0),
            right: () => movePiece(1, 0),
            down: () => movePiece(0, 1),
            rotate: () => { if (gameRunning) rotatePiece(); },
            drop: () => { if (gameRunning) hardDrop(); },
        };

        document.querySelectorAll('[data-action]').forEach(btn => {
            const action = actionMap[btn.dataset.action];
            if (!action) return;

            // 触摸
            btn.addEventListener('touchstart', (e) => {
                e.preventDefault();
                if (!gameRunning) { startGame(); return; }
                if (paused) return;
                action();
            }, { passive: false });

            // 鼠标
            btn.addEventListener('mousedown', (e) => {
                e.preventDefault();
                if (!gameRunning) { startGame(); return; }
                if (paused) return;
                action();
            });
        });
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

    // 加载存储的昵称
    const savedName = localStorage.getItem('tetrisPlayerName');
    if (savedName) playerNameInput.value = savedName;
    playerNameInput.addEventListener('input', () => {
        localStorage.setItem('tetrisPlayerName', playerNameInput.value);
    });

    highScoreEl.textContent = highScore;
    init();

    setupTouchControls();

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);
    startBtn.addEventListener('click', startGame);

    // 检测云端连接并加载排行榜
    checkCloudConnection().then(connected => {
        if (connected) {
            renderLeaderboard();
            setInterval(renderLeaderboard, 60000);
        } else {
            lbStatus.textContent = '离线模式';
            lbList.innerHTML = '<div class="lb-empty">☁️ 未连接到云端，分数仅保存在本地</div>';
        }
    });
})();
