# Games ClaudeCode — 项目规则

## 工作流程

- **修改 → 展示 → 确认 → 推送**：每次改动后先展示给用户看，用户确认后再执行 `git push`。不得擅自推送。
- 展示内容包括：改了什么文件、改了什么内容、为什么改。
- 用户说"推送"或"push"后再执行推送。

## 项目结构

```
public/
├── index.html              # 游戏合集主页
├── snake/                  # 🐍 贪吃蛇
├── tetris/                 # 🧱 俄罗斯方块
├── breakout/               # 🏓 打砖块
├── 2048/                   # 🟦 2048
├── minesweeper/            # 💣 扫雷
└── flappy/                 # 🐦 Flappy Bird
```

## 设计风格

- 背景：暗紫渐变 `#0f0c29 → #302b63 → #24243e`
- header：底部细线分隔，无毛玻璃背景
- 计分板：纯文字，无背景面板
- 按钮：橙金渐变 `#f7971e → #ffd200`
- 返回按钮：hover 下划线，无背景框
- 不同游戏可拥有不同布局（不强制统一竖式排布）

## 游戏开发规范

- 每个游戏独立目录 `public/<game>/`，含 index.html、style.css、game.js
- 使用 IIFE 包裹 JS，避免全局污染
- 云端 API 格式统一：`POST /api/score` + `GET /api/score?game=<name>`
- localStorage key 格式：`<game>HighScore`、`<game>PlayerName`
