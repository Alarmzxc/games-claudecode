(function () {
    'use strict';

    // ---- DOM refs ----
    const gridEl = document.getElementById('grid');
    const minesCountEl = document.getElementById('minesCount');
    const timerEl = document.getElementById('timer');
    const gamesWonEl = document.getElementById('gamesWon');
    const smileyBtn = document.getElementById('smileyBtn');
    const playerNameInput = document.getElementById('playerName');
    const cloudBadge = document.getElementById('cloudBadge');
    const lbList = document.getElementById('lbList');
    const lbStatus = document.getElementById('lbStatus');
    const diffBtns = document.querySelectorAll('.diff-btn');

    // ---- Constants ----
    const DIFFICULTIES = {
        beginner:     { rows: 9,  cols: 9,  mines: 10 },
        intermediate: { rows: 16, cols: 16, mines: 40 },
        hard:         { rows: 16, cols: 30, mines: 99 },
    };

    const NUMBER_COLORS = {
        1: '#2563eb', 2: '#16a34a', 3: '#dc2626',
        4: '#1e3a8a', 5: '#7f1d1d', 6: '#0d9488',
        7: '#1a1a2e', 8: '#6b7280',
    };

    const GAME = 'minesweeper';
    let CLOUD_AVAILABLE = false;

    // ---- Game state ----
    let difficulty = 'beginner';
    let rows = 9;
    let cols = 9;
    let mineCount = 10;
    let grid = [];               // 2D array of cell objects
    let cells = [];              // flat array of DOM elements
    let minesGenerated = false;
    let revealedCount = 0;
    let flagCount = 0;
    let gameActive = false;
    let gameLost = false;
    let gameWon = false;
    let timerStarted = false;
    let timerValue = 0;
    let timerInterval = null;
    let firstClickDone = false;
    let gamesWon = parseInt(localStorage.getItem('minesweeperGamesWon')) || 0;
    let bestTime = parseInt(localStorage.getItem('minesweeperBestTime')) || null;

    // ---- Helper ----
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
            if (data.playerBest && (!bestTime || data.playerBest < bestTime)) {
                bestTime = data.playerBest;
                localStorage.setItem('minesweeperBestTime', bestTime);
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
            if (res.ok) {
                const data = await res.json();
                if (data.blob === true) {
                    CLOUD_AVAILABLE = true;
                    cloudBadge.textContent = '☁️ 已连接';
                    cloudBadge.className = 'cloud-badge online';
                    return true;
                }
                CLOUD_AVAILABLE = false;
                cloudBadge.textContent = '☁️ Blob未通';
                cloudBadge.className = 'cloud-badge error';
                return false;
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

        if (bestTime === null && data.best) {
            bestTime = data.best;
            localStorage.setItem('minesweeperBestTime', bestTime);
        }

        const medals = ['🥇', '🥈', '🥉'];
        const rankClasses = ['gold', 'silver', 'bronze'];

        lbList.innerHTML = data.leaderboard
            .map(function (entry, i) {
                const rank = i + 1;
                const isMe = entry.player === getPlayerName();
                const medal = i < 3 ? medals[i] : '';
                const rankClass = i < 3 ? rankClasses[i] : '';
                const timeDisplay = formatTime(entry.score);
                return (
                    '<div class="lb-row' + (isMe ? ' lb-me' : '') + '">' +
                        '<span class="lb-rank ' + rankClass + '">' + (medal || rank) + '</span>' +
                        '<span class="lb-player">' + escapeHtml(entry.player) + (isMe ? ' 👈' : '') + '</span>' +
                        '<span class="lb-score">' + timeDisplay + '</span>' +
                    '</div>'
                );
            })
            .join('');
    }

    function escapeHtml(text) {
        var div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function formatTime(seconds) {
        if (seconds == null || seconds === 0) return '—';
        var m = Math.floor(seconds / 60);
        var s = seconds % 60;
        if (m > 0) {
            return m + '分' + (s < 10 ? '0' : '') + s + '秒';
        }
        return s + '秒';
    }

    // ====================== Board Logic ======================

    function getCell(row, col) {
        if (row < 0 || row >= rows || col < 0 || col >= cols) return null;
        return grid[row][col];
    }

    function getNeighbors(row, col) {
        var neighbors = [];
        for (var dr = -1; dr <= 1; dr++) {
            for (var dc = -1; dc <= 1; dc++) {
                if (dr === 0 && dc === 0) continue;
                var r = row + dr;
                var c = col + dc;
                if (r >= 0 && r < rows && c >= 0 && c < cols) {
                    neighbors.push({ row: r, col: c });
                }
            }
        }
        return neighbors;
    }

    function generateBoard(firstRow, firstCol) {
        // Create empty grid
        grid = [];
        for (var r = 0; r < rows; r++) {
            grid[r] = [];
            for (var c = 0; c < cols; c++) {
                grid[r][c] = {
                    mine: false,
                    revealed: false,
                    flagged: false,
                    adjacentMines: 0,
                    exploded: false,
                };
            }
        }

        // Build set of excluded positions (first click + neighbors)
        var excluded = {};
        for (var dr = -1; dr <= 1; dr++) {
            for (var dc = -1; dc <= 1; dc++) {
                var er = firstRow + dr;
                var ec = firstCol + dc;
                if (er >= 0 && er < rows && ec >= 0 && ec < cols) {
                    excluded[er + ',' + ec] = true;
                }
            }
        }

        // Place mines
        var placed = 0;
        while (placed < mineCount) {
            var r = Math.floor(Math.random() * rows);
            var c = Math.floor(Math.random() * cols);
            var key = r + ',' + c;
            if (!grid[r][c].mine && !excluded[key]) {
                grid[r][c].mine = true;
                placed++;
            }
        }

        // Calculate adjacent mine counts
        for (var r = 0; r < rows; r++) {
            for (var c = 0; c < cols; c++) {
                if (grid[r][c].mine) continue;
                var count = 0;
                var nb = getNeighbors(r, c);
                for (var i = 0; i < nb.length; i++) {
                    if (grid[nb[i].row][nb[i].col].mine) count++;
                }
                grid[r][c].adjacentMines = count;
            }
        }

        minesGenerated = true;
        firstClickDone = true;
    }

    // ====================== Rendering ======================

    function buildGrid() {
        gridEl.innerHTML = '';
        cells = [];

        // Dynamically size wrapper based on difficulty
        var wrapper = document.querySelector('.grid-wrapper');
        var targetCell = difficulty === 'hard' ? 24 : (difficulty === 'intermediate' ? 30 : 40);
        var idealWidth = cols * targetCell + (cols - 1) + 8;
        var maxVw = window.innerWidth - 40;
        wrapper.style.maxWidth = Math.min(idealWidth, maxVw) + 'px';
        wrapper.style.width = '100%';

        var maxWidth = wrapper.clientWidth;
        // Leave room for padding + gap
        var usableWidth = maxWidth - 4;
        var gapTotal = (cols - 1) * 1;
        var cellSize = Math.floor((usableWidth - gapTotal - 4) / cols);
        cellSize = Math.min(cellSize, 54);
        cellSize = Math.max(cellSize, 16);
        var gridWidth = cellSize * cols + gapTotal + 4;

        gridEl.style.gridTemplateColumns = 'repeat(' + cols + ', ' + cellSize + 'px)';
        gridEl.style.gridAutoRows = cellSize + 'px';
        gridEl.style.setProperty('--cell-size', cellSize + 'px');

        // Per-cell long press tracking (Map<cellId, {triggered, timer}>)
        var longPressMap = new Map();

        // Create cells
        for (var r = 0; r < rows; r++) {
            for (var c = 0; c < cols; c++) {
                var cell = document.createElement('div');
                cell.className = 'cell';
                cell.dataset.row = r;
                cell.dataset.col = c;
                var cellId = r * cols + c;

                // Left click (works on both desktop and mobile tap)
                cell.addEventListener('click', (function (row, col, id) {
                    return function () {
                        var state = longPressMap.get(id);
                        if (state && state.triggered) {
                            // Consumed by preceding long press
                            state.triggered = false;
                            return;
                        }
                        handleClick(row, col);
                    };
                })(r, c, cellId));

                // Right click (desktop)
                cell.addEventListener('contextmenu', (function (row, col) {
                    return function (e) {
                        e.preventDefault();
                        handleRightClick(row, col);
                    };
                })(r, c));

                // Long press for mobile: touch events only manage long press state.
                // The 'click' event (above) checks the long press flag and skips if set.
                cell.addEventListener('touchstart', (function (row, col, id) {
                    return function () {
                        longPressMap.set(id, { triggered: false });
                        var state = longPressMap.get(id);
                        state.timer = setTimeout(function () {
                            state.triggered = true;
                            handleRightClick(row, col);
                        }, 500);
                    };
                })(r, c, cellId), { passive: true });

                cell.addEventListener('touchmove', (function (id) {
                    return function () {
                        var state = longPressMap.get(id);
                        if (state) clearTimeout(state.timer);
                    };
                })(cellId), { passive: true });

                cell.addEventListener('touchend', (function (id) {
                    return function () {
                        var state = longPressMap.get(id);
                        if (state) clearTimeout(state.timer);
                    };
                })(cellId), { passive: true });

                cell.addEventListener('touchcancel', (function (id) {
                    return function () {
                        var state = longPressMap.get(id);
                        if (state) clearTimeout(state.timer);
                    };
                })(cellId), { passive: true });

                gridEl.appendChild(cell);
                cells.push(cell);
            }
        }
    }

    function renderGrid() {
        for (var r = 0; r < rows; r++) {
            for (var c = 0; c < cols; c++) {
                var cellObj = grid[r][c];
                var idx = r * cols + c;
                var cellEl = cells[idx];
                var content = '';

                cellEl.className = 'cell';

                if (cellObj.revealed) {
                    cellEl.classList.add('revealed');

                    if (cellObj.mine) {
                        cellEl.classList.add('mine');
                        content = '<span class="mine-icon">💣</span>';
                    } else if (cellObj.adjacentMines > 0) {
                        var numClass = 'num-' + cellObj.adjacentMines;
                        var color = NUMBER_COLORS[cellObj.adjacentMines] || '#eee';
                        content = '<span class="' + numClass + '" style="color:' + color + '">' + cellObj.adjacentMines + '</span>';
                    }
                } else if (cellObj.flagged) {
                    cellEl.classList.add('flagged');
                    content = '<span class="mine-icon">🚩</span>';
                }

                if (cellObj.exploded) {
                    cellEl.classList.add('exploded');
                    content = '<span class="mine-icon">💥</span>';
                }

                cellEl.innerHTML = content;
            }
        }

        // Update mines count display
        var minesLeft = mineCount - flagCount;
        minesCountEl.textContent = minesLeft;

        // Update smiley
        if (gameWon) {
            smileyBtn.textContent = '😎';
        } else if (gameLost) {
            smileyBtn.textContent = '😵';
        } else {
            smileyBtn.textContent = '😊';
        }
    }

    // ====================== Cell Interaction ======================

    function handleClick(row, col) {
        if (!gameActive || gameLost || gameWon) return;
        var cell = getCell(row, col);
        if (!cell) return;
        if (cell.flagged) return;
        if (cell.revealed) return;

        // First click: generate mines
        if (!firstClickDone) {
            generateBoard(row, col);
            startTimer();
        }

        // Start timer on first action if not already
        if (!timerStarted) {
            startTimer();
        }

        if (cell.mine) {
            // Game over
            cell.exploded = true;
            endGame(false);
            return;
        }

        // Reveal cell
        revealCell(row, col);
        renderGrid();

        // Check win
        if (checkWin()) {
            endGame(true);
        }
    }

    function handleRightClick(row, col) {
        if (!gameActive || gameLost || gameWon) return;
        var cell = getCell(row, col);
        if (!cell) return;
        if (cell.revealed) return;

        if (cell.flagged) {
            cell.flagged = false;
            flagCount--;
        } else {
            // Can't flag more than total mines
            if (flagCount >= mineCount) return;
            cell.flagged = true;
            flagCount++;
        }

        renderGrid();
    }

    function revealCell(row, col) {
        var cell = getCell(row, col);
        if (!cell) return;
        if (cell.revealed || cell.flagged) return;
        if (cell.mine) return;

        cell.revealed = true;
        revealedCount++;

        // Flood fill for empty cells
        if (cell.adjacentMines === 0) {
            var neighbors = getNeighbors(row, col);
            for (var i = 0; i < neighbors.length; i++) {
                revealCell(neighbors[i].row, neighbors[i].col);
            }
        }
    }

    function checkWin() {
        var totalSafe = rows * cols - mineCount;
        return revealedCount === totalSafe;
    }

    // ====================== Timer ======================

    function startTimer() {
        if (timerStarted) return;
        timerStarted = true;
        timerValue = 0;
        timerEl.textContent = '0';
        timerInterval = setInterval(function () {
            timerValue++;
            timerEl.textContent = timerValue;
        }, 1000);
    }

    function stopTimer() {
        if (timerInterval) {
            clearInterval(timerInterval);
            timerInterval = null;
        }
    }

    // ====================== Game Flow ======================

    function initBoard() {
        // Reset state
        grid = [];
        minesGenerated = false;
        revealedCount = 0;
        flagCount = 0;
        firstClickDone = false;
        gameLost = false;
        gameWon = false;
        gameActive = true;

        // Don't reset timer started state — timer will start on first click
        timerStarted = false;
        timerValue = 0;
        timerEl.textContent = '0';
        stopTimer();

        // Create empty grid structure
        grid = [];
        for (var r = 0; r < rows; r++) {
            grid[r] = [];
            for (var c = 0; c < cols; c++) {
                grid[r][c] = {
                    mine: false,
                    revealed: false,
                    flagged: false,
                    adjacentMines: 0,
                    exploded: false,
                };
            }
        }

        // Update display
        minesCountEl.textContent = mineCount;
        renderGrid();
    }

    function startNewGame() {
        stopTimer();
        initBoard();
        renderGrid();
    }

    function endGame(won) {
        gameActive = false;
        stopTimer();

        if (won) {
            gameWon = true;
            gamesWon++;
            localStorage.setItem('minesweeperGamesWon', gamesWon);
            renderGrid();

            // Check if this is a new best time
            var isNewBest = false;
            if (bestTime === null || timerValue < bestTime) {
                bestTime = timerValue;
                localStorage.setItem('minesweeperBestTime', bestTime);
                isNewBest = true;
            }

            // Submit to cloud
            var cloudMsg = '';
            if (CLOUD_AVAILABLE && timerValue > 0) {
                submitScore(bestTime).then(function (result) {
                    if (result) {
                        renderLeaderboard();
                    }
                });
                cloudMsg = '<br><span style="color:#7dd3fc;font-size:0.8rem">☁️ 已同步至云端排行榜</span>';
            }

            // Update UI
            gamesWonEl.textContent = gamesWon;

            // Show win overlay
            showOverlay(
                '🎉 你赢了！',
                '用时 ' + timerValue + ' 秒，共 ' + mineCount + ' 颗雷' +
                    (isNewBest ? '<br><span style="color:#fbbf24;font-weight:700">🏆 新纪录！</span>' : '') + cloudMsg,
                '😎 再来一局'
            );

        } else {
            gameLost = true;
            // Reveal all mines
            for (var r = 0; r < rows; r++) {
                for (var c = 0; c < cols; c++) {
                    if (grid[r][c].mine) {
                        grid[r][c].revealed = true;
                    }
                }
            }
            renderGrid();

            showOverlay(
                '💥 踩雷了！',
                '本次用时 ' + timerValue + ' 秒',
                '😵 再来一局'
            );
        }
    }

    function showOverlay(title, message, btnText) {
        // Create overlay if it doesn't exist
        var overlay = document.querySelector('.overlay');
        if (!overlay) {
            var wrapper = document.querySelector('.grid-wrapper');
            overlay = document.createElement('div');
            overlay.className = 'overlay';
            wrapper.appendChild(overlay);
        }

        overlay.classList.remove('hidden');
        overlay.innerHTML =
            '<div class="overlay-content">' +
                '<h2>' + title + '</h2>' +
                '<p>' + message + '</p>' +
                '<div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap">' +
                    '<button id="overlayRestartBtn" class="btn">' + btnText + '</button>' +
                    '<button id="overlayDismissBtn" class="btn" style="background:rgba(255,255,255,0.1);color:#ccc;font-size:0.85rem">查看棋盘</button>' +
                '</div>' +
            '</div>';

        document.getElementById('overlayRestartBtn').addEventListener('click', function () {
            overlay.classList.add('hidden');
            startNewGame();
        });

        document.getElementById('overlayDismissBtn').addEventListener('click', function () {
            overlay.classList.add('hidden');
        });
    }

    // ====================== Difficulty ======================

    function setDifficulty(diff) {
        if (difficulty === diff) return;

        difficulty = diff;
        var config = DIFFICULTIES[diff];
        rows = config.rows;
        cols = config.cols;
        mineCount = config.mines;

        // Update active button
        diffBtns.forEach(function (btn) {
            btn.classList.toggle('active', btn.dataset.diff === diff);
        });

        // Rebuild grid
        stopTimer();
        buildGrid();
        initBoard();
        renderGrid();

        // Hide overlay if showing
        var overlay = document.querySelector('.overlay');
        if (overlay) overlay.classList.add('hidden');
    }

    // ====================== Bootstrap ======================

    // Load saved name
    var savedName = localStorage.getItem('minesweeperPlayerName');
    if (savedName) playerNameInput.value = savedName;
    playerNameInput.addEventListener('input', function () {
        localStorage.setItem('minesweeperPlayerName', playerNameInput.value);
    });

    // Load games won
    gamesWonEl.textContent = gamesWon;

    // Difficulty buttons
    diffBtns.forEach(function (btn) {
        btn.addEventListener('click', function () {
            setDifficulty(btn.dataset.diff);
        });
    });

    // Smiley button - reset game
    smileyBtn.addEventListener('click', function () {
        var overlay = document.querySelector('.overlay');
        if (overlay) overlay.classList.add('hidden');
        startNewGame();
    });

    // Prevent context menu on the whole game area (the grid)
    gridEl.addEventListener('contextmenu', function (e) {
        e.preventDefault();
    });

    // Initialize
    buildGrid();
    initBoard();
    renderGrid();

    // Cloud connection and leaderboard
    checkCloudConnection().then(function (connected) {
        if (connected) {
            renderLeaderboard();
            // 排行榜仅在提交分数成功后刷新，不自动轮询
        } else {
            lbStatus.textContent = '离线模式';
            lbList.innerHTML = '<div class="lb-empty">☁️ 未连接到云端，分数仅保存在本地</div>';
        }
    });

    // Handle resize to recalculate cell sizes
    var resizeTimeout = null;
    window.addEventListener('resize', function () {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(function () {
            // Rebuild grid with new sizes
            var currentCells = document.querySelectorAll('.cell').length;
            if (currentCells === rows * cols) {
                // Only recalculate if grid cells exist and match expected count
                buildGrid();
                renderGrid();
            }
        }, 250);
    });

})();
