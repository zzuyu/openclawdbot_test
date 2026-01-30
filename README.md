# openclawdbot_test_demo — 你画我猜

一个最小可跑的 **你画我猜** demo：
- 前端：Vite + React + TS（端口 **5173**，避免与 OpenClaw 占用的 18789 冲突）
- 后端：FastAPI + WebSocket（端口 **8000**）

## 本地/Codespaces 启动

### 1) 启动后端
```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

### 2) 启动前端（端口 5173）
```bash
cd frontend
npm install
npm run dev -- --host 0.0.0.0 --port 5173
```

前端会把 `/api` 和 `/ws` 代理到后端的 `127.0.0.1:8000`。

## 玩法
1. 打开前端，输入昵称 + 房间号
2. 多开几个浏览器/无痕窗口加入同一房间
3. 点击“开始一局”
4. 轮到的画师会看到题目，其他人只能看到方块
5. 猜中 +10 分，自动结束本轮

## Demo 风格
默认走：自然配色 + 古风/中国特色（青黛/朱砂/宣纸）。
