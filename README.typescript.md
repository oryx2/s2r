# screen2report (TypeScript)

本地模型服务管理工具（macOS）- TypeScript 重构版本。

## 功能

- **自动模型管理**：安装时自动检测、下载并启动模型服务
- **简洁 CLI**：仅三个命令（start / stop / status）
- **OpenAI 兼容**：提供 http://127.0.0.1:18279/v1 标准接口
- **截图分析**：定时捕获屏幕并分析工作内容
- **日报生成**：基于屏幕活动自动生成工作日报

## 快速开始

### 安装依赖

```bash
npm install
```

### 构建

```bash
npm run build
```

### CLI 命令

```bash
# 启动模型服务（后台运行）
npm start -- start

# 查看服务状态
npm start -- status

# 停止模型服务
npm start -- stop

# 手动触发截图分析
npm start -- capture

# 生成日报
npm start -- report
npm start -- report --date 2024-01-15

# 卸载服务
npm start -- uninstall
```

服务启动后，API 地址：`http://127.0.0.1:18279/v1`

### 配置

复制 `.env.example` 为 `.env` 并修改：

```bash
cp .env.example .env
```

## 目录结构

```
~/.screen-report/
├── bin/
│   └── s2r              # CLI 二进制
├── models/
│   └── Qwen3.5-0.8B/    # 模型文件
│       └── *.gguf
├── runtime/
│   └── llama-server     # llama.cpp 服务端
├── data/
│   ├── screenshots/     # 截图目录
│   └── analysis/        # 分析记录
├── reports/             # 生成的日报
├── logs/
│   └── model_server.log # 服务日志
├── run/
│   └── model_server.pid # 进程 PID
└── .env                 # 环境配置
```

## 开发

```bash
# 开发模式运行
npm run dev -- start

# 类型检查
npm run typecheck

# 代码检查
npm run lint
```

## 卸载

```bash
npm start -- uninstall
rm -rf ~/.screen-report
```

## 说明

- 仅支持 macOS
- 模型默认优先从 ModelScope 下载，失败时回退到 Hugging Face
- 服务日志：`~/.screen-report/logs/model_server.log`

## 架构

```
src/
├── cli.ts              # CLI 入口
├── index.ts            # 模块导出
├── types/              # TypeScript 类型定义
├── core/               # 核心逻辑
│   ├── captureLogic.ts # 截图分析逻辑
│   ├── reportLogic.ts  # 日报生成逻辑
│   ├── env.ts          # 环境变量
│   ├── dotenv.ts       # .env 文件加载
│   └── errors.ts       # 错误类型
├── services/           # 服务层
│   ├── captureService.ts  # 截图服务
│   ├── reportService.ts   # 日报服务
│   ├── modelService.ts    # 模型管理
│   ├── launchdService.ts  # macOS 服务管理
│   └── openaiCompat.ts    # OpenAI API 兼容
└── utils/              # 工具函数
    ├── shell.ts        # Shell 命令
    ├── fileStore.ts    # 文件操作
    └── screenshot.ts   # 截图工具
```
