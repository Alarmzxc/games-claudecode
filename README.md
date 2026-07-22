# 🎮 游戏合集

一个基于纯前端（HTML/CSS/JS）的轻量游戏合集，部署于 **Vercel**，支持云端存档与排行榜。

> 🐍 贪吃蛇已完成 · 更多游戏开发中

---

## 📸 预览

| 合集首页 | 贪吃蛇游戏 |
|:---:|:---:|
| 卡片式布局，统计面板 | 居中对称 UI，速度进度条 |
| 云端分数自动同步 | 排行榜 + 玩家昵称 |

## 🚀 快速部署

### 方式一：GitHub + Vercel（推荐）

```bash
# 1. 创建 GitHub 仓库并推送
git init
git add .
git commit -m "🎮 游戏合集"
gh repo create <仓库名> --public --push

# 2. 浏览器打开 https://vercel.com/new
#    导入该仓库 → 点击 Deploy → ✅ 完成
```

### 方式二：Vercel CLI

```bash
npm i -g vercel
vercel
```

---

## ☁️ 启用云端存档

部署后，前往 **Vercel Dashboard** 开启 Blob 存储：

1. 进入项目 → **Storage** → **Create → Blob Store**
2. 创建后复制 `BLOB_READ_WRITE_TOKEN`
3. **Settings → Environment Variables** → 添加：

| Name | Value |
|------|-------|
| `BLOB_READ_WRITE_TOKEN` | 上一步复制的 Token |

4. 回到 **Deployments** → 找到最新部署 → 点 **Redeploy**

之后所有用户分数自动同步到云端，排行榜功能同时生效。  
*未配置 Token 时自动降级为 `localStorage` 本地存储，功能不受影响。*

---

## 📁 项目结构

```
├── public/                   # 前端静态文件
│   ├── index.html            # 游戏合集首页
│   └── snake/                # 贪吃蛇游戏
│       ├── index.html        #   页面结构
│       ├── game.js           #   游戏逻辑 + 云端存档
│       └── style.css         #   样式
├── api/                      # Vercel Serverless 函数
│   ├── score.js              #   提交/获取分数
│   └── leaderboard.js        #   全局排行榜
├── vercel.json               # Vercel 部署配置
├── package.json              # 依赖声明
└── README.md
```

---

## 🐍 贪吃蛇游戏

| 功能 | 说明 |
|------|------|
| **键盘操控** | `↑ ↓ ← →` 或 `W A S D` |
| **触屏支持** | 按钮点击 + 滑动手势 |
| **暂停/继续** | `Space` 键 |
| **速度系统** | 每吃 3 个食物升一级，共 15 级，速度条实时反馈 |
| **最高分** | 本地 `localStorage` + 云端双存储 |
| **排行榜** | 游戏下方实时显示，每 60s 自动刷新 |
| **玩家昵称** | 可自定义，自动保存 |

### API 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/api/score` | 提交分数 `{ game, score, player }` |
| `GET` | `/api/score?game=snake` | 获取某游戏排行榜 |
| `GET` | `/api/leaderboard` | 全局跨游戏排行榜 |

---

## 🧑‍💻 本地开发

```bash
# 安装依赖
npm install

# 启动本地开发服务器（需安装 Vercel CLI）
npx vercel dev
```

---

## 🗺️ 开发路线

- [x] 🐍 **贪吃蛇** — 已上线
- [ ] 🎲 **俄罗斯方块** — 开发中
- [ ] 🏓 **打砖块** — 计划中
- [ ] 🧩 **拼图游戏** — 计划中

---

## 🛠 技术栈

- **前端**: 原生 HTML5 + CSS3 + JavaScript (Canvas)
- **存储**: Vercel Blob (Serverless 对象存储)
- **部署**: Vercel (Serverless Functions + Static Hosting)
- **CI/CD**: GitHub + Vercel 自动部署

---

<p align="center">🎮 用 ❤️ 和 HTML/CSS/JS 打造</p>
