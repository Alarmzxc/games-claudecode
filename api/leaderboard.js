import { list } from '@vercel/blob';

/**
 * GET /api/leaderboard  — 全局排行榜（所有游戏汇总）
 * GET /api/leaderboard?game=snake  — 指定游戏排行榜
 */
export async function GET(request) {
    try {
        const url = new URL(request.url);
        const gameFilter = url.searchParams.get('game');

        // 列出所有分数文件
        const { blobs } = await list({ prefix: 'scores_' });

        let allScores = [];

        for (const blob of blobs) {
            const gameName = blob.pathname.replace('scores_', '').replace('.json', '');

            // 如果指定了 game 参数，跳过不匹配的
            if (gameFilter && gameName !== gameFilter) continue;

            try {
                const resp = await fetch(blob.url);
                if (!resp.ok) continue;
                const data = await resp.json();
                if (Array.isArray(data)) {
                    allScores.push(
                        ...data.map(s => ({ ...s, game: gameName }))
                    );
                }
            } catch {
                // 跳过损坏的文件
            }
        }

        // 按游戏分组，每个游戏只取前 10
        const grouped = new Map();
        allScores.forEach(s => {
            if (!grouped.has(s.game)) grouped.set(s.game, []);
            grouped.get(s.game).push(s);
        });

        const leaderboard = {};
        for (const [game, scores] of grouped) {
            const bestPerPlayer = new Map();
            scores.forEach(s => {
                const current = bestPerPlayer.get(s.player) || 0;
                if (s.score > current) bestPerPlayer.set(s.player, s.score);
            });

            leaderboard[game] = Array.from(bestPerPlayer.entries())
                .map(([player, score]) => ({ player, score }))
                .sort((a, b) => b.score - a.score)
                .slice(0, 10);
        }

        return Response.json({
            games: Object.keys(leaderboard),
            leaderboard,
        });
    } catch (err) {
        console.error('GET /api/leaderboard 错误:', err);
        return Response.json({ error: '服务器内部错误' }, { status: 500 });
    }
}
