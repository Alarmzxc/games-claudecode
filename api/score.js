import { put, list, del } from '@vercel/blob';

const SCORE_FILE_PREFIX = 'scores_';

/**
 * POST /api/score  — 提交分数
 * Body: { game: string, score: number, player?: string }
 */
export async function POST(request) {
    try {
        const body = await request.json();
        const { game, score, player } = body;

        // 参数校验
        if (!game || typeof game !== 'string') {
            return Response.json({ error: '缺少 game 参数' }, { status: 400 });
        }
        if (typeof score !== 'number' || score < 0 || !Number.isInteger(score)) {
            return Response.json({ error: 'score 必须是非负整数' }, { status: 400 });
        }

        const playerName = (player || '匿名玩家').trim().slice(0, 20) || '匿名玩家';
        const timestamp = Date.now();

        // 读取现有分数列表
        const blobPath = `${SCORE_FILE_PREFIX}${game}.json`;
        let scores = [];
        try {
            const existingBlob = await fetch(
                `https://blob.vercel-storage.com/${blobPath}`,
                { headers: { Authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}` } }
            );
            if (existingBlob.ok) {
                const data = await existingBlob.json();
                if (Array.isArray(data)) scores = data;
            }
        } catch {
            // 文件不存在视为首次提交
        }

        // 添加新分数
        scores.push({
            player: playerName,
            score,
            game,
            timestamp,
            date: new Date(timestamp).toISOString().split('T')[0],
        });

        // 只保留每个玩家该游戏的最佳 N 条记录 + 控制文件体积
        scores = scores
            .sort((a, b) => b.score - a.score)
            .slice(0, 200);

        // 写回 Blob 存储
        await put(blobPath, JSON.stringify(scores), {
            access: 'public',
            contentType: 'application/json',
            addRandomSuffix: false,
        });

        // 返回该玩家的个人最佳 & 全局排名
        const playerBest = Math.max(
            ...scores.filter(s => s.player === playerName).map(s => s.score),
            0
        );
        const rank = scores.findIndex(s => s.player === playerName && s.score === playerBest) + 1;

        return Response.json({
            success: true,
            playerBest,
            totalPlayers: new Set(scores.map(s => s.player)).size,
            rank: rank > 0 ? rank : null,
        });
    } catch (err) {
        console.error('POST /api/score 错误:', err);
        return Response.json({ error: '服务器内部错误' }, { status: 500 });
    }
}

/**
 * GET /api/score?game=snake  — 获取该游戏的最佳分数
 */
export async function GET(request) {
    try {
        const url = new URL(request.url);
        const game = url.searchParams.get('game') || 'snake';
        const blobPath = `${SCORE_FILE_PREFIX}${game}.json`;

        let scores = [];
        try {
            const existingBlob = await fetch(
                `https://blob.vercel-storage.com/${blobPath}`,
                { headers: { Authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}` } }
            );
            if (existingBlob.ok) {
                const data = await existingBlob.json();
                if (Array.isArray(data)) scores = data;
            }
        } catch {
            // 无数据
        }

        // 每个玩家只取最高分
        const bestPerPlayer = new Map();
        scores.forEach(s => {
            const current = bestPerPlayer.get(s.player) || 0;
            if (s.score > current) bestPerPlayer.set(s.player, s.score);
        });

        const leaderboard = Array.from(bestPerPlayer.entries())
            .map(([player, score]) => ({ player, score }))
            .sort((a, b) => b.score - a.score)
            .slice(0, 50);

        return Response.json({
            game,
            best: leaderboard[0]?.score || 0,
            total: leaderboard.length,
            leaderboard,
        });
    } catch (err) {
        console.error('GET /api/score 错误:', err);
        return Response.json({ error: '服务器内部错误' }, { status: 500 });
    }
}
