(function () {
    'use strict';

    // ========================================================================
    // DOM refs
    // ========================================================================
    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');
    const scoreEl = document.getElementById('score');
    const highScoreEl = document.getElementById('highScore');
    const livesEl = document.getElementById('lives');
    const bricksLeftEl = document.getElementById('bricksLeft');
    const progressFill = document.getElementById('progressFill');
    const progressLabel = document.getElementById('progressLabel');
    const overlay = document.getElementById('overlay');
    const overlayContent = document.getElementById('overlayContent');
    const startBtn = document.getElementById('startBtn');
    const playerNameInput = document.getElementById('playerName');
    const cloudBadge = document.getElementById('cloudBadge');
    const lbList = document.getElementById('lbList');
    const lbStatus = document.getElementById('lbStatus');

    // ========================================================================
    // Constants
    // ========================================================================
    const GAME = 'breakout';
    const CW = 480;
    const CH = 360;

    // Paddle
    const PW = 80;
    const PH = 12;
    const PY = CH - 30;
    const PADDLE_SPEED = 6;

    // Ball
    const BR = 6; // radius
    const BALL_SPEED_INIT = 4;
    const BALL_SPEED_MAX = 9;
    const SPEED_INCREMENT = 0.25;

    // Bricks
    const BRICK_ROWS = 6;
    const BRICKS_PER_ROW = 8;
    const BH = 16;
    const BPAD = 4; // gap between bricks
    const BTOP = 40;  // top margin for first row
    const BLEFT = 10; // left margin
    const BW = (CW - BLEFT * 2 - BPAD * (BRICKS_PER_ROW - 1)) / BRICKS_PER_ROW;

    const MAX_LIVES = 3;
    const MAX_ANGLE = 65 * Math.PI / 180;
    const MIN_ANGLE = 15 * Math.PI / 180;

    // Row config: [color, lightColor (after 1 hit), points, maxHits]
    const ROW_CFG = [
        { color: '#e74c3c', light: '#f1948a', pts: 50, hits: 2 },
        { color: '#e67e22', light: '#f0b27a', pts: 40, hits: 2 },
        { color: '#f1c40f', light: '#f7dc6f', pts: 30, hits: 2 },
        { color: '#2ecc71', light: '#82e0aa', pts: 20, hits: 1 },
        { color: '#3498db', light: '#85c1e9', pts: 10, hits: 1 },
        { color: '#9b59b6', light: '#c39bd3', pts: 5,  hits: 1 },
    ];

    let CLOUD_AVAILABLE = false;

    // ========================================================================
    // Game state
    // ========================================================================
    let paddle = { x: 0, y: PY };
    let ball = { x: 0, y: 0, dx: 0, dy: 0, speed: BALL_SPEED_INIT };
    let bricks = [];
    let score = 0;
    let highScore = parseInt(localStorage.getItem('breakoutHighScore')) || 0;
    let lives = MAX_LIVES;
    let gameRunning = false;
    let gameOver = false;
    let paused = false;
    let ballLaunched = false;
    let totalBricks = 0;
    let animFrame = null;
    let keysHeld = {};
    let touchDir = 0; // -1 left, 1 right, 0 none
    let wontEat = 0;  // frames to ignore paddle after launch (safety)

    const getPlayerName = () => (playerNameInput.value || '匿名玩家').trim().slice(0, 12) || '匿名玩家';

    // ========================================================================
    // Cloud API (exact same pattern as snake)
    // ========================================================================
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
                localStorage.setItem('breakoutHighScore', highScore);
                highScoreEl.textContent = highScore;
            }
            return data;
        } catch (err) {
            console.warn('Cloud save failed:', err.message);
            return null;
        }
    }

    async function fetchLeaderboard() {
        try {
            const res = await fetch('/api/score?game=' + GAME + '&_=' + Date.now());
            if (!res.ok) throw new Error('HTTP ' + res.status);
            return await res.json();
        } catch (err) {
            console.warn('Fetch leaderboard failed:', err.message);
            return null;
        }
    }

    async function checkCloudConnection() {
        try {
            const res = await fetch('/api/score?game=ping');
            if (res.ok || res.status === 400) {
                CLOUD_AVAILABLE = true;
                cloudBadge.textContent = '☁️ Connected';
                cloudBadge.className = 'cloud-badge online';
                return true;
            }
            throw new Error('HTTP ' + res.status);
        } catch {
            CLOUD_AVAILABLE = false;
            cloudBadge.textContent = '☁️ Offline';
            cloudBadge.className = 'cloud-badge error';
            return false;
        }
    }

    async function renderLeaderboard() {
        lbStatus.textContent = 'Loading...';
        lbList.innerHTML = '<div class="lb-empty">Fetching leaderboard...</div>';
        const data = await fetchLeaderboard();
        if (!data || !data.leaderboard || data.leaderboard.length === 0) {
            lbStatus.textContent = 'No data';
            lbList.innerHTML = '<div class="lb-empty">Be the first to play!</div>';
            return;
        }
        lbStatus.textContent = 'Total ' + data.total;

        if (data.best > highScore) {
            highScore = data.best;
            highScoreEl.textContent = highScore;
        }

        const medals = ['🥇', '🥈', '🥉'];
        const rankClasses = ['gold', 'silver', 'bronze'];

        lbList.innerHTML = data.leaderboard.map(function (entry, i) {
            const rank = i + 1;
            const isMe = entry.player === getPlayerName();
            const medal = i < 3 ? medals[i] : '';
            const rc = i < 3 ? rankClasses[i] : '';
            return '<div class="lb-row' + (isMe ? ' lb-me' : '') + '">' +
                '<span class="lb-rank ' + rc + '">' + (medal || rank) + '</span>' +
                '<span class="lb-player">' + escapeHtml(entry.player) + (isMe ? ' 👉' : '') + '</span>' +
                '<span class="lb-score">' + entry.score + '</span></div>';
        }).join('');
    }

    function escapeHtml(text) {
        var div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // ========================================================================
    // Brick generation
    // ========================================================================
    function buildBricks() {
        var result = [];
        for (var r = 0; r < BRICK_ROWS; r++) {
            var cfg = ROW_CFG[r];
            for (var c = 0; c < BRICKS_PER_ROW; c++) {
                var bx = BLEFT + c * (BW + BPAD);
                var by = BTOP + r * (BH + BPAD);
                result.push({
                    x: bx, y: by, w: BW, h: BH,
                    color: cfg.color,
                    light: cfg.light,
                    points: cfg.pts,
                    maxHits: cfg.hits,
                    hits: cfg.hits,
                });
            }
        }
        return result;
    }

    // ========================================================================
    // Init / Reset
    // ========================================================================
    function init() {
        paddle.x = (CW - PW) / 2;
        paddle.y = PY;
        resetBall(true);
        bricks = buildBricks();
        totalBricks = bricks.length;
        score = 0;
        lives = MAX_LIVES;
        gameOver = false;
        paused = false;
        ballLaunched = false;
        touchDir = 0;
        wontEat = 0;
        updateUI();
        updateLivesDisplay();
        updateProgress();
        draw();
    }

    function resetBall(keepSpeed) {
        ball.x = paddle.x + PW / 2;
        ball.y = paddle.y - BR;
        ball.dx = 0;
        ball.dy = 0;
        if (!keepSpeed) {
            ball.speed = BALL_SPEED_INIT;
        }
        ballLaunched = false;
        wontEat = 0;
    }

    function launchBall() {
        if (ballLaunched) return;
        ballLaunched = true;
        var dir = Math.random() > 0.5 ? 1 : -1;
        var angle = Math.random() * 0.5 + 0.3; // 0.3-0.8 rad (~17-46 deg) from vertical
        ball.dx = dir * ball.speed * Math.sin(angle);
        ball.dy = -ball.speed * Math.cos(angle);
        wontEat = 3; // ignore paddle for first few frames
    }

    // ========================================================================
    // Update
    // ========================================================================
    function update() {
        if (paused || gameOver || !gameRunning) return;

        // ---- Keyboard paddle ----
        var kLeft = keysHeld['ArrowLeft'] || keysHeld['a'] || keysHeld['A'];
        var kRight = keysHeld['ArrowRight'] || keysHeld['d'] || keysHeld['D'];
        if (kLeft && !kRight) {
            paddle.x = Math.max(0, paddle.x - PADDLE_SPEED);
        }
        if (kRight && !kLeft) {
            paddle.x = Math.min(CW - PW, paddle.x + PADDLE_SPEED);
        }

        // ---- Touch button paddle ----
        if (touchDir !== 0) {
            paddle.x = Math.max(0, Math.min(CW - PW, paddle.x + touchDir * PADDLE_SPEED));
        }

        // Ball follows paddle before launch
        if (!ballLaunched) {
            ball.x = paddle.x + PW / 2;
            ball.y = paddle.y - BR;
            draw();
            return;
        }

        // Decrement wontEat
        if (wontEat > 0) wontEat--;

        // ---- Move ball ----
        ball.x += ball.dx;
        ball.y += ball.dy;

        // ---- Wall collisions ----
        // Left wall
        if (ball.x - BR < 0) {
            ball.x = BR;
            ball.dx = -ball.dx;
        }
        // Right wall
        if (ball.x + BR > CW) {
            ball.x = CW - BR;
            ball.dx = -ball.dx;
        }
        // Top wall
        if (ball.y - BR < 0) {
            ball.y = BR;
            ball.dy = -ball.dy;
        }
        // Bottom = lost ball
        if (ball.y + BR > CH) {
            loseLife();
            return;
        }

        // ---- Anti-stuck: prevent horizontal-only bouncing ----
        // If vertical velocity is too small, nudge it downward so the
        // ball returns to the paddle and cannot get trapped in a
        // horizontal loop between the side walls or bricks.
        if (Math.abs(ball.dy) < 0.3) {
            ball.dy = 0.3; // always nudge downward toward paddle
            var normSpd = Math.sqrt(ball.dx * ball.dx + ball.dy * ball.dy);
            if (normSpd > 0.001) {
                var normRatio = ball.speed / normSpd;
                ball.dx *= normRatio;
                ball.dy *= normRatio;
            }
        }

        // ---- Paddle collision ----
        if (wontEat === 0 && ball.dy > 0 &&
            ball.y + BR >= paddle.y &&
            ball.y - BR <= paddle.y + PH &&
            ball.x + BR > paddle.x &&
            ball.x - BR < paddle.x + PW) {

            // Calculate hit position: -1 (left edge) to +1 (right edge)
            var pcx = paddle.x + PW / 2;
            var hitPos = (ball.x - pcx) / (PW / 2);
            hitPos = Math.max(-1, Math.min(1, hitPos));

            // Map to angle: center = vertical, edges = angled
            var angle = hitPos * MAX_ANGLE;
            if (Math.abs(angle) < MIN_ANGLE) {
                angle = angle >= 0 ? MIN_ANGLE : -MIN_ANGLE;
            }

            var speed = ball.speed;
            ball.dx = speed * Math.sin(angle);
            ball.dy = -speed * Math.cos(angle);
            ball.y = paddle.y - BR; // push out above paddle
        }

        // ---- Brick collisions ----
        var safety = 20;
        while (safety > 0) {
            safety--;
            var hitIdx = -1;
            for (var i = 0; i < bricks.length; i++) {
                if (ballBrickOverlap(ball, bricks[i])) {
                    hitIdx = i;
                    break;
                }
            }
            if (hitIdx === -1) break;

            var brick = bricks[hitIdx];
            resolveBrickCollision(ball, brick);

            brick.hits--;
            if (brick.hits <= 0) {
                // Brick destroyed
                score += brick.points;
                bricks.splice(hitIdx, 1);
                // Increase ball speed
                ball.speed = Math.min(BALL_SPEED_MAX, ball.speed + SPEED_INCREMENT);
                var curSpeed = Math.sqrt(ball.dx * ball.dx + ball.dy * ball.dy);
                if (curSpeed > 0.001) {
                    var ratio = ball.speed / curSpeed;
                    ball.dx *= ratio;
                    ball.dy *= ratio;
                }
                updateUI();
                updateProgress();
            }

            // Check win
            if (bricks.length === 0) {
                winGame();
                return;
            }
        }

        draw();
    }

    // ---- Ball-brick overlap test ----
    function ballBrickOverlap(b, brick) {
        if (b.x + BR <= brick.x) return false;
        if (b.x - BR >= brick.x + brick.w) return false;
        if (b.y + BR <= brick.y) return false;
        if (b.y - BR >= brick.y + brick.h) return false;
        return true;
    }

    // ---- Resolve ball-brick collision ----
    function resolveBrickCollision(b, brick) {
        // Compute overlap on each side
        var overlapLeft  = (b.x + BR) - brick.x;
        var overlapRight = (brick.x + brick.w) - (b.x - BR);
        var overlapTop   = (b.y + BR) - brick.y;
        var overlapBottom= (brick.y + brick.h) - (b.y - BR);

        var minX = Math.min(overlapLeft, overlapRight);
        var minY = Math.min(overlapTop, overlapBottom);

        if (minX < minY) {
            // Hit left or right side
            b.dx = -b.dx;
            if (overlapLeft < overlapRight) {
                b.x = brick.x - BR;
            } else {
                b.x = brick.x + brick.w + BR;
            }
        } else if (minY < minX) {
            // Hit top or bottom
            b.dy = -b.dy;
            if (overlapTop < overlapBottom) {
                b.y = brick.y - BR;
            } else {
                b.y = brick.y + brick.h + BR;
            }
        } else {
            // Corner hit (minX === minY) — reflect both
            b.dx = -b.dx;
            b.dy = -b.dy;
            if (overlapLeft < overlapRight) {
                b.x = brick.x - BR;
            } else {
                b.x = brick.x + brick.w + BR;
            }
            if (overlapTop < overlapBottom) {
                b.y = brick.y - BR;
            } else {
                b.y = brick.y + brick.h + BR;
            }
        }

        // Safety: ensure ball speed stays normalized (prevent tiny drift)
        var spd = Math.sqrt(b.dx * b.dx + b.dy * b.dy);
        if (spd > 0.001) {
            var ratio = b.speed / spd;
            b.dx *= ratio;
            b.dy *= ratio;
        }
    }

    // ========================================================================
    // Life / Score / Win / Game Over
    // ========================================================================
    function loseLife() {
        lives--;
        updateLivesDisplay();
        if (lives <= 0) {
            gameRunning = false;
            gameOver = true;
            endGame();
        } else {
            resetBall(false);
            // Keep gameRunning true, ball sits on paddle
            draw();
        }
    }

    function winGame() {
        gameRunning = false;
        gameOver = true;

        var finalScore = score;
        var isNewHigh = finalScore > 0 && finalScore >= highScore;

        if (isNewHigh) {
            highScore = finalScore;
            localStorage.setItem('breakoutHighScore', highScore);
            highScoreEl.textContent = highScore;
        }

        var cloudInfo = '';
        (async function () {
            if (CLOUD_AVAILABLE && finalScore > 0) {
                var result = await submitScore(finalScore);
                if (result) {
                    cloudInfo = '<p style="color:#7dd3fc;font-size:0.8rem;margin-top:4px">Saved to cloud rank #' + (result.rank || '?') + '</p>';
                }
            }
            overlay.classList.remove('hidden');
            overlayContent.innerHTML =
                '<h2>Clear!</h2>' +
                '<p>All bricks destroyed!</p>' +
                '<p style="font-size:2rem;font-weight:700;color:#fbbf24;margin:10px 0">' + finalScore + ' pts</p>' +
                '<p style="color:#888;font-size:0.85rem">Best: ' + highScore + (isNewHigh && finalScore > 0 ? ' NEW RECORD!' : '') + '</p>' +
                cloudInfo +
                '<button id="restartBtn" class="btn" style="margin-top:14px">Play Again</button>';
            document.getElementById('restartBtn').addEventListener('click', startGame);
            if (CLOUD_AVAILABLE) renderLeaderboard();
        })();
    }

    function endGame() {
        if (animFrame) { cancelAnimationFrame(animFrame); animFrame = null; }

        var finalScore = score;
        var isNewHigh = finalScore > 0 && finalScore >= highScore;

        if (isNewHigh) {
            highScore = finalScore;
            localStorage.setItem('breakoutHighScore', highScore);
            highScoreEl.textContent = highScore;
        }

        var cloudInfo = '';
        (async function () {
            if (CLOUD_AVAILABLE && finalScore > 0) {
                var result = await submitScore(finalScore);
                if (result) {
                    cloudInfo = '<p style="color:#7dd3fc;font-size:0.8rem;margin-top:4px">Saved to cloud rank #' + (result.rank || '?') + '</p>';
                }
            }
            overlay.classList.remove('hidden');
            overlayContent.innerHTML =
                '<h2>Game Over</h2>' +
                '<p style="font-size:2rem;font-weight:700;color:#fbbf24;margin:14px 0">' + finalScore + ' pts</p>' +
                '<p style="color:#888;font-size:0.85rem">Best: ' + highScore + (isNewHigh && finalScore > 0 ? ' NEW RECORD!' : '') + '</p>' +
                cloudInfo +
                '<button id="restartBtn" class="btn" style="margin-top:14px">Play Again</button>';
            document.getElementById('restartBtn').addEventListener('click', startGame);
            if (CLOUD_AVAILABLE) renderLeaderboard();
        })();
    }

    // ========================================================================
    // Draw
    // ========================================================================
    function draw() {
        ctx.clearRect(0, 0, CW, CH);

        // Subtle grid
        ctx.strokeStyle = 'rgba(255,255,255,0.03)';
        ctx.lineWidth = 1;
        for (var x = 0; x <= CW; x += 40) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, CH);
            ctx.stroke();
        }
        for (var y = 0; y <= CH; y += 40) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(CW, y);
            ctx.stroke();
        }

        // ---- Bricks ----
        var idx, brick;
        for (idx = 0; idx < bricks.length; idx++) {
            brick = bricks[idx];
            var fillColor = brick.hits === brick.maxHits ? brick.color : brick.light;
            ctx.fillStyle = fillColor;
            ctx.beginPath();
            ctx.roundRect(brick.x, brick.y, brick.w, brick.h, 3);
            ctx.fill();

            // Highlight strip on top half
            ctx.fillStyle = 'rgba(255,255,255,0.15)';
            ctx.beginPath();
            ctx.roundRect(brick.x + 2, brick.y + 2, brick.w - 4, brick.h / 2 - 2, 2);
            ctx.fill();

            // Bottom shadow
            ctx.fillStyle = 'rgba(0,0,0,0.12)';
            ctx.beginPath();
            ctx.roundRect(brick.x + 2, brick.y + brick.h / 2 + 1, brick.w - 4, brick.h / 2 - 2, 2);
            ctx.fill();
        }

        // ---- Paddle ----
        var pg = ctx.createLinearGradient(paddle.x, paddle.y, paddle.x, paddle.y + PH);
        pg.addColorStop(0, '#7dd3fc');
        pg.addColorStop(0.5, '#60a5fa');
        pg.addColorStop(1, '#3b82f6');
        ctx.fillStyle = pg;
        ctx.beginPath();
        ctx.roundRect(paddle.x, paddle.y, PW, PH, 6);
        ctx.fill();

        // Paddle highlight
        ctx.fillStyle = 'rgba(255,255,255,0.25)';
        ctx.beginPath();
        ctx.roundRect(paddle.x + 8, paddle.y + 2, PW - 16, 4, 2);
        ctx.fill();

        // Paddle ends highlight
        ctx.fillStyle = 'rgba(255,255,255,0.12)';
        ctx.beginPath();
        ctx.roundRect(paddle.x + 2, paddle.y + 2, 6, PH - 4, 2);
        ctx.fill();
        ctx.beginPath();
        ctx.roundRect(paddle.x + PW - 8, paddle.y + 2, 6, PH - 4, 2);
        ctx.fill();

        // ---- Ball ----
        var bx = ball.x;
        var by = ball.y;

        // Glow
        var glow = ctx.createRadialGradient(bx, by, 0, bx, by, BR * 2.5);
        glow.addColorStop(0, 'rgba(255, 255, 255, 0.25)');
        glow.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(bx, by, BR * 2.5, 0, Math.PI * 2);
        ctx.fill();

        // Ball body
        var bg = ctx.createRadialGradient(bx - 2, by - 2, 0, bx, by, BR);
        bg.addColorStop(0, '#ffffff');
        bg.addColorStop(0.4, '#e2e8f0');
        bg.addColorStop(1, '#94a3b8');
        ctx.fillStyle = bg;
        ctx.beginPath();
        ctx.arc(bx, by, BR, 0, Math.PI * 2);
        ctx.fill();

        // Shine dot
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.beginPath();
        ctx.arc(bx - 2, by - 2, BR * 0.3, 0, Math.PI * 2);
        ctx.fill();
    }

    // ========================================================================
    // UI updates
    // ========================================================================
    function updateUI() {
        scoreEl.textContent = score;
        if (score > highScore) {
            highScore = score;
            localStorage.setItem('breakoutHighScore', highScore);
            highScoreEl.textContent = highScore;
        }
        bricksLeftEl.textContent = bricks.length;
    }

    function updateLivesDisplay() {
        var hearts = '';
        for (var i = 0; i < lives; i++) hearts += '❤️';
        livesEl.textContent = hearts;
    }

    function updateProgress() {
        var pct = totalBricks > 0 ? ((totalBricks - bricks.length) / totalBricks) * 100 : 0;
        progressFill.style.width = pct + '%';
        progressLabel.textContent = bricks.length + ' remain';
    }

    // ========================================================================
    // Pause / Start
    // ========================================================================
    function togglePause() {
        if (!gameRunning || gameOver) return;
        if (!ballLaunched) return; // don't pause when ball is sitting on paddle
        paused = !paused;
        if (paused) {
            overlay.classList.remove('hidden');
            overlayContent.innerHTML =
                '<h2>Paused</h2>' +
                '<p style="margin-top:8px">Press <kbd style="background:rgba(255,255,255,0.1);padding:2px 8px;border-radius:4px;min-width:auto">P</kbd> to resume</p>';
        } else {
            overlay.classList.add('hidden');
        }
    }

    function startGame() {
        init();
        gameRunning = true;
        overlay.classList.add('hidden');
        if (animFrame) cancelAnimationFrame(animFrame);
        animFrame = requestAnimationFrame(gameLoop);
    }

    function gameLoop() {
        if (!gameRunning) return;
        update();
        if (gameRunning) {
            animFrame = requestAnimationFrame(gameLoop);
        }
    }

    // ========================================================================
    // Input — Keyboard
    // ========================================================================
    function handleKeyDown(e) {
        var key = e.key;

        if (key === ' ' || key === 'Space') {
            e.preventDefault();
            if (!gameRunning) {
                startGame();
            } else if (!ballLaunched && !gameOver) {
                launchBall();
            }
            return;
        }

        if (key === 'Enter' && !gameRunning) {
            startGame();
            return;
        }

        if (key === 'p' || key === 'P') {
            e.preventDefault();
            togglePause();
            return;
        }

        // Movement keys
        if (key === 'ArrowLeft' || key === 'ArrowRight' ||
            key === 'a' || key === 'A' || key === 'd' || key === 'D') {
            e.preventDefault();
            keysHeld[key] = true;
        }
    }

    function handleKeyUp(e) {
        var key = e.key;
        if (key === 'ArrowLeft' || key === 'ArrowRight' ||
            key === 'a' || key === 'A' || key === 'd' || key === 'D') {
            keysHeld[key] = false;
        }
    }

    // ========================================================================
    // Input — Mouse
    // ========================================================================
    function handleMouseMove(e) {
        var rect = canvas.getBoundingClientRect();
        var scaleX = CW / rect.width;
        var mx = (e.clientX - rect.left) * scaleX;
        paddle.x = Math.max(0, Math.min(CW - PW, mx - PW / 2));

        if (gameRunning && !ballLaunched) {
            ball.x = paddle.x + PW / 2;
            ball.y = paddle.y - BR;
            draw();
        }
    }

    function handleCanvasClick(e) {
        if (!gameRunning) {
            startGame();
        } else if (!ballLaunched && !gameOver) {
            launchBall();
        }
    }

    // ========================================================================
    // Input — Touch (canvas drag + buttons)
    // ========================================================================
    var lastTouchX = null;

    function handleTouchStart(e) {
        var t = e.touches[0];
        lastTouchX = t.clientX;
        if (t.clientX !== undefined && gameRunning && !ballLaunched) {
            var rect = canvas.getBoundingClientRect();
            var scaleX = CW / rect.width;
            var mx = (t.clientX - rect.left) * scaleX;
            paddle.x = Math.max(0, Math.min(CW - PW, mx - PW / 2));
            ball.x = paddle.x + PW / 2;
            ball.y = paddle.y - BR;
            draw();
        }
    }

    function handleTouchMove(e) {
        e.preventDefault();
        if (e.touches.length === 0) return;
        var t = e.touches[0];
        lastTouchX = t.clientX;
        var rect = canvas.getBoundingClientRect();
        var scaleX = CW / rect.width;
        var mx = (t.clientX - rect.left) * scaleX;
        paddle.x = Math.max(0, Math.min(CW - PW, mx - PW / 2));

        if (gameRunning && !ballLaunched) {
            ball.x = paddle.x + PW / 2;
            ball.y = paddle.y - BR;
            draw();
        }
    }

    function handleTouchEnd(e) {
        // If it was a tap (not a drag), launch ball
        if (lastTouchX !== null && e.changedTouches.length > 0) {
            var t = e.changedTouches[0];
            var dx = Math.abs(t.clientX - lastTouchX);
            if (dx < 10 && gameRunning && !ballLaunched && !gameOver) {
                launchBall();
            }
        }
        lastTouchX = null;
    }

    function setupTouchButtons() {
        document.querySelectorAll('.touch-btn').forEach(function (btn) {
            var dir = btn.dataset.dir === 'left' ? -1 : 1;
            var startFn = function (e) {
                e.preventDefault();
                touchDir = dir;
                if (!gameRunning) { startGame(); return; }
                if (!ballLaunched && gameRunning) {
                    // paddle moves in update loop
                }
            };
            var endFn = function (e) {
                e.preventDefault();
                if (touchDir === dir) touchDir = 0;
            };
            btn.addEventListener('touchstart', startFn, { passive: false });
            btn.addEventListener('touchend', endFn, { passive: false });
            btn.addEventListener('touchcancel', endFn);
            // Also support mouse for desktop testing
            btn.addEventListener('mousedown', startFn);
            btn.addEventListener('mouseup', endFn);
            btn.addEventListener('mouseleave', endFn);
        });
    }

    // ========================================================================
    // roundRect polyfill (same as snake)
    // ========================================================================
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

    // ========================================================================
    // Bootstrap
    // ========================================================================

    // Load saved name
    var savedName = localStorage.getItem('breakoutPlayerName');
    if (savedName) playerNameInput.value = savedName;
    playerNameInput.addEventListener('input', function () {
        localStorage.setItem('breakoutPlayerName', playerNameInput.value);
    });

    highScoreEl.textContent = highScore;
    init();

    // Event listeners
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('click', handleCanvasClick);
    canvas.addEventListener('touchstart', handleTouchStart, { passive: true });
    canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
    canvas.addEventListener('touchend', handleTouchEnd, { passive: true });

    startBtn.addEventListener('click', startGame);
    setupTouchButtons();

    // Cloud connection + leaderboard
    checkCloudConnection().then(function (connected) {
        if (connected) {
            renderLeaderboard();
            setInterval(renderLeaderboard, 60000);
        } else {
            lbStatus.textContent = 'Offline';
            lbList.innerHTML = '<div class="lb-empty">Cloud unavailable, scores saved locally</div>';
        }
    });
})();
