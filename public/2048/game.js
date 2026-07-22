(function () {
    'use strict';

    // ====================== DOM Refs ======================
    const scoreEl = document.getElementById('score');
    const bestScoreEl = document.getElementById('bestScore');
    const gridContainer = document.getElementById('gridContainer');
    const tilesContainer = document.getElementById('tilesContainer');
    const overlay = document.getElementById('overlay');
    const overlayContent = document.getElementById('overlayContent');
    const startBtn = document.getElementById('startBtn');
    const newGameBtn = document.getElementById('newGameBtn');
    const playerNameInput = document.getElementById('playerName');
    const cloudBadge = document.getElementById('cloudBadge');
    const lbList = document.getElementById('lbList');
    const lbStatus = document.getElementById('lbStatus');

    // ====================== Constants ======================
    const SIZE = 4;
    const GAME = '2048';

    let CLOUD_AVAILABLE = false;

    // ====================== Game State ======================
    let grid = [];
    let score = 0;
    let best = parseInt(localStorage.getItem('2048HighScore')) || 0;
    let gameRunning = false;
    let gameOver = false;
    let hasWon = false;
    let keepPlaying = false;
    let isAnimating = false;
    let cellEls = []; // flat array of 16 cell divs
    let tileValues = []; // flat array of current values (for detecting changes)

    // ====================== Cell Geometry ======================
    // CSS grid with 4 columns, 3% gap
    // cellPct = (100 - 3*3) / 4 = 22.75
    const CELL_PCT = 22.75;
    const GAP_PCT = 3;

    // ====================== Grid Rendering ======================

    function buildGrid() {
        gridContainer.innerHTML = '';
        tilesContainer.innerHTML = '';

        // Background grid
        const bg = document.createElement('div');
        bg.className = 'grid-bg';
        for (let i = 0; i < SIZE * SIZE; i++) {
            const cell = document.createElement('div');
            cell.className = 'grid-bg-cell';
            bg.appendChild(cell);
        }
        gridContainer.appendChild(bg);

        cellEls = [];
        tileValues = [];
        for (let i = 0; i < SIZE * SIZE; i++) {
            const el = document.createElement('div');
            el.className = 'grid-cell';
            gridContainer.appendChild(el);
            cellEls.push(el);
            tileValues.push(0);
        }
    }

    function idx(row, col) { return row * SIZE + col; }

    function getCellStyle(row, col) {
        const left = col * (CELL_PCT + GAP_PCT);
        const top = row * (CELL_PCT + GAP_PCT);
        return { left: left + '%', top: top + '%', width: CELL_PCT + '%', height: CELL_PCT + '%' };
    }

    function renderGrid() {
        for (let r = 0; r < SIZE; r++) {
            for (let c = 0; c < SIZE; c++) {
                const i = idx(r, c);
                const cell = cellEls[i];
                const val = grid[r][c];
                const oldVal = tileValues[i];

                // Position
                const style = getCellStyle(r, c);
                cell.style.left = style.left;
                cell.style.top = style.top;
                cell.style.width = style.width;
                cell.style.height = style.height;

                // Value and class
                cell.textContent = val || '';
                cell.className = 'grid-cell';
                if (val > 0) {
                    cell.classList.add('tile-val');
                    const cls = val <= 2048 ? 'tile-' + val : 'tile-super';
                    cell.classList.add(cls);

                    // Pop animation for newly spawned tiles
                    if (val !== oldVal && oldVal === 0) {
                        cell.classList.add('tile-new');
                    }
                    // Pulse for merged tiles
                    if (val !== oldVal && oldVal > 0 && val > oldVal) {
                        cell.classList.add('tile-merged');
                    }
                }

                tileValues[i] = val;
            }
        }
    }

    function clearAnimations() {
        cellEls.forEach(el => {
            el.classList.remove('tile-new', 'tile-merged');
        });
    }

    // ====================== Grid Logic ======================

    function createGrid() {
        grid = Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
        tileValues = Array(SIZE * SIZE).fill(0);
    }

    function getEmptyCells() {
        const cells = [];
        for (let r = 0; r < SIZE; r++) {
            for (let c = 0; c < SIZE; c++) {
                if (grid[r][c] === 0) cells.push({ r, c });
            }
        }
        return cells;
    }

    function addRandomTile() {
        const empty = getEmptyCells();
        if (empty.length === 0) return false;
        const pos = empty[Math.floor(Math.random() * empty.length)];
        grid[pos.r][pos.c] = Math.random() < 0.9 ? 2 : 4;
        return pos;
    }

    // ---- Slide Logic ----

    function slideLine(line) {
        // line: array of 4 numbers (0 = empty)
        // returns { result: [4 numbers], scoreGain, changed }
        const tiles = line.filter(v => v !== 0);

        const merged = [];
        let scoreGain = 0;

        for (let i = 0; i < tiles.length; i++) {
            if (i + 1 < tiles.length && tiles[i] === tiles[i + 1]) {
                merged.push(tiles[i] * 2);
                scoreGain += tiles[i] * 2;
                i++; // skip next
            } else {
                merged.push(tiles[i]);
            }
        }

        const result = [...merged, ...Array(SIZE - merged.length).fill(0)];
        const changed = result.some((v, i) => v !== line[i]);

        return { result, scoreGain, changed };
    }

    function extractRow(r) {
        return [...grid[r]];
    }

    function setRow(r, values) {
        grid[r] = [...values];
    }

    function extractCol(c) {
        return grid.map(row => row[c]);
    }

    function setCol(c, values) {
        for (let r = 0; r < SIZE; r++) {
            grid[r][c] = values[r];
        }
    }

    function processMove(direction) {
        if (isAnimating || gameOver || !gameRunning) return false;
        if (hasWon && !keepPlaying) return false;

        let totalGain = 0;
        let changed = false;

        // Save old grid for comparison
        const oldGrid = grid.map(row => [...row]);

        if (direction === 'left') {
            for (let r = 0; r < SIZE; r++) {
                const line = extractRow(r);
                const res = slideLine(line);
                if (res.changed) {
                    setRow(r, res.result);
                    totalGain += res.scoreGain;
                    changed = true;
                }
            }
        } else if (direction === 'right') {
            for (let r = 0; r < SIZE; r++) {
                const line = extractRow(r).reverse();
                const res = slideLine(line);
                if (res.changed) {
                    setRow(r, res.result.reverse());
                    totalGain += res.scoreGain;
                    changed = true;
                }
            }
        } else if (direction === 'up') {
            for (let c = 0; c < SIZE; c++) {
                const line = extractCol(c);
                const res = slideLine(line);
                if (res.changed) {
                    setCol(c, res.result);
                    totalGain += res.scoreGain;
                    changed = true;
                }
            }
        } else if (direction === 'down') {
            for (let c = 0; c < SIZE; c++) {
                const line = extractCol(c).reverse();
                const res = slideLine(line);
                if (res.changed) {
                    setCol(c, res.result.reverse());
                    totalGain += res.scoreGain;
                    changed = true;
                }
            }
        }

        if (!changed) return false;

        isAnimating = true;
        clearAnimations();

        // Update score
        score += totalGain;

        // Render with animation (tiles moving and merging)
        renderGrid();

        // After animation, finalize
        setTimeout(() => {
            // Final render (remove animation classes)
            updateUI();
            clearAnimations();
            renderGrid();

            // Spawn new tile
            const newPos = addRandomTile();
            if (newPos) {
                tileValues[idx(newPos.r, newPos.c)] = 0; // force pop animation
            }

            // Render with new tile
            renderGrid();

            // Check game state
            checkGameState();

            isAnimating = false;
        }, 150);

        return true;
    }

    // ====================== Game State Checks ======================

    function hasEmptyCells() {
        return getEmptyCells().length > 0;
    }

    function canMerge() {
        for (let r = 0; r < SIZE; r++) {
            for (let c = 0; c < SIZE; c++) {
                const v = grid[r][c];
                if (v === 0) continue;
                if (c + 1 < SIZE && grid[r][c + 1] === v) return true;
                if (r + 1 < SIZE && grid[r + 1][c] === v) return true;
            }
        }
        return false;
    }

    function isGameOver() {
        return !hasEmptyCells() && !canMerge();
    }

    function hasWonTile() {
        for (let r = 0; r < SIZE; r++) {
            for (let c = 0; c < SIZE; c++) {
                if (grid[r][c] >= 2048) return true;
            }
        }
        return false;
    }

    function checkGameState() {
        if (hasWonTile() && !hasWon && !keepPlaying) {
            hasWon = true;
            showWinOverlay();
            return;
        }

        if (isGameOver()) {
            endGame();
        }
    }

    // ====================== UI Updates ======================

    function updateUI() {
        scoreEl.textContent = score;
        if (score > best) {
            best = score;
            localStorage.setItem('2048HighScore', best);
            bestScoreEl.textContent = best;
        }
    }

    // ====================== Game Lifecycle ======================

    function init() {
        createGrid();
        score = 0;
        gameOver = false;
        hasWon = false;
        keepPlaying = false;
        isAnimating = false;
        bestScoreEl.textContent = best;
        updateUI();

        clearAnimations();
        renderGrid();
    }

    function startGame() {
        init();

        // Add 2 random tiles
        addRandomTile();
        addRandomTile();

        gameRunning = true;
        overlay.classList.add('hidden');
        renderGrid();
    }

    function resetGame() {
        if (gameRunning) {
            startGame();
        } else {
            init();
            startGame();
        }
    }

    function showWinOverlay() {
        overlay.classList.remove('hidden');
        overlayContent.innerHTML = `
            <h2>🎉 你赢了！</h2>
            <p>你合成了 2048 方块！</p>
            <p style="font-size:2rem;font-weight:700;color:#fbbf24;margin:10px 0">${score} 分</p>
            <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap">
                <button id="keepBtn" class="btn" style="font-size:0.85rem;padding:8px 18px">继续挑战</button>
                <button id="newGameWinBtn" class="btn" style="font-size:0.85rem;padding:8px 18px">新游戏</button>
            </div>
        `;
        document.getElementById('keepBtn').addEventListener('click', () => {
            keepPlaying = true;
            overlay.classList.add('hidden');
        });
        document.getElementById('newGameWinBtn').addEventListener('click', resetGame);
    }

    async function endGame() {
        gameRunning = false;
        gameOver = true;

        const finalScore = score;
        const isNewHigh = finalScore > 0 && finalScore >= best;

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
            <p>没有可移动的方块了</p>
            <p style="font-size:2rem;font-weight:700;color:#fbbf24;margin:10px 0">${finalScore} 分</p>
            <p style="color:#888;font-size:0.85rem">
                最高分: ${best}${isNewHigh && finalScore > 0 ? '<br>🎉 新纪录！' : ''}
            </p>
            ${cloudInfo}
            <button id="restartBtn" class="btn" style="margin-top:14px">再来一局</button>
        `;
        document.getElementById('restartBtn').addEventListener('click', resetGame);

        if (CLOUD_AVAILABLE) renderLeaderboard();
    }

    // ====================== Input ======================

    function handleKey(e) {
        const key = e.key;

        if ((key === ' ' || key === 'Space' || key === 'Enter') && !gameRunning) {
            e.preventDefault();
            startGame();
            return;
        }

        if (!gameRunning || isAnimating) return;

        const dirMap = {
            ArrowLeft: 'left', ArrowRight: 'right',
            ArrowUp: 'up', ArrowDown: 'down',
            a: 'left', A: 'left', d: 'right', D: 'right',
            w: 'up', W: 'up', s: 'down', S: 'down',
        };

        const dir = dirMap[key];
        if (dir) {
            e.preventDefault();
            processMove(dir);
        }
    }

    // ---- Touch Swipe ----
    let touchStart = null;

    function setupSwipe() {
        gridContainer.addEventListener('touchstart', (e) => {
            const t = e.touches[0];
            touchStart = { x: t.clientX, y: t.clientY };
        }, { passive: true });

        gridContainer.addEventListener('touchend', (e) => {
            if (!touchStart || !gameRunning || isAnimating) { touchStart = null; return; }
            if (!gameRunning) { startGame(); touchStart = null; return; }

            const t = e.changedTouches[0];
            const dx = t.clientX - touchStart.x;
            const dy = t.clientY - touchStart.y;
            touchStart = null;

            const absDx = Math.abs(dx);
            const absDy = Math.abs(dy);
            if (Math.max(absDx, absDy) < 30) return;

            let dir;
            if (absDx > absDy) {
                dir = dx > 0 ? 'right' : 'left';
            } else {
                dir = dy > 0 ? 'down' : 'up';
            }
            processMove(dir);
        }, { passive: true });
    }

    // ---- Touch Buttons ----
    function setupTouchControls() {
        document.querySelectorAll('[data-action]').forEach(btn => {
            const action = btn.dataset.action;
            const handler = (e) => {
                e.preventDefault();
                if (!gameRunning) { startGame(); return; }
                processMove(action);
            };
            btn.addEventListener('touchstart', handler, { passive: false });
            btn.addEventListener('mousedown', handler);
        });
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
            if (data.playerBest > best) {
                best = data.playerBest;
                localStorage.setItem('2048HighScore', best);
                bestScoreEl.textContent = best;
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

        if (data.best > best) {
            best = data.best;
            bestScoreEl.textContent = best;
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

    function getPlayerName() {
        return (playerNameInput.value || '匿名玩家').trim().slice(0, 12) || '匿名玩家';
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // ====================== Bootstrap ======================

    // Load saved name
    const savedName = localStorage.getItem('2048PlayerName');
    if (savedName) playerNameInput.value = savedName;
    playerNameInput.addEventListener('input', () => {
        localStorage.setItem('2048PlayerName', playerNameInput.value);
    });

    // Build the grid
    buildGrid();

    bestScoreEl.textContent = best;
    init();

    // Show start overlay
    overlay.classList.remove('hidden');
    overlayContent.innerHTML = `
        <h2>🟦 2048</h2>
        <p>使用方向键或滑动合并数字方块<br>凑出 2048 即获胜！</p>
        <button id="startBtn" class="btn">开始游戏</button>
    `;
    document.getElementById('startBtn').addEventListener('click', startGame);

    // Events
    newGameBtn.addEventListener('click', resetGame);
    document.addEventListener('keydown', handleKey);
    setupSwipe();
    setupTouchControls();

    // Cloud
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
