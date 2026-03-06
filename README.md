# screen2report

屏幕截图分析日报工具（macOS）- 默认使用 Ollama 本地模型。

## 功能

- **截图分析**：定时捕获屏幕并使用 LLM 分析工作内容
- **日报生成**：基于屏幕活动自动生成工作日报
- **兼容 Ollama**：默认使用本地 Ollama，无需联网
- **灵活配置**：支持 OpenAI、OpenRouter 等远程 API
- **定时任务**：自动截图（每5分钟）和生成日报（每天18:30）

## 快速开始

### 安装

```bash
# 一键安装
curl -fsSL https://raw.githubusercontent.com/oryx2/s2r/main/install.sh | bash
```

### 配置 LLM

默认使用 **Ollama** 本地服务（`http://localhost:11434/v1`）。

确保 Ollama 已安装并运行：
```bash
# 安装 Ollama
brew install ollama

# 拉取模型
ollama pull qwen2.5:0.5b

# 启动服务
ollama serve
```

如需使用其他 API，编辑配置文件：
```bash
nano ~/.screen-report/.env
```

配置示例：
```bash
# OpenAI
OPENAI_API_KEY=your-api-key
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4o-mini

# 或其他兼容 API（OpenRouter、Together AI 等）
OPENAI_API_KEY=your-key
OPENAI_BASE_URL=https://openrouter.ai/api/v1
OPENAI_MODEL=qwen/qwen2.5-vl-72b-instruct:free
```

### CLI 命令

```bash
# 查看配置状态
s2r status

# 设置定时任务
s2r setup

# 手动触发截图分析
s2r capture

# 生成日报
s2r report
s2r report --date 2024-01-15

# 卸载服务
s2r uninstall
```

## 目录结构

```
~/.screen-report/
├── bin/
│   └── s2r              # CLI 二进制
├── data/
│   ├── screenshots/     # 截图目录
│   └── analysis/        # 分析记录
├── reports/             # 生成的日报
├── logs/                # 日志文件
└── .env                 # 环境配置
```

## 配置说明

`.env` 文件示例：

```bash
# API Key（Ollama 默认为 ollama，其他服务需填写真实 key）
OPENAI_API_KEY=ollama

# API 基础 URL（默认 Ollama）
OPENAI_BASE_URL=http://localhost:11434/v1

# API 风格
# - chat_completions: 标准 Chat Completions API（Ollama 兼容）
# - responses: OpenAI Responses API
OPENAI_API_STYLE=chat_completions

# 是否使用 JSON Schema（Ollama 建议关闭）
OPENAI_USE_JSON_SCHEMA=0

# 模型名称
OPENAI_MODEL=qwen2.5:0.5b
OPENAI_REPORT_MODEL=qwen2.5:0.5b

# 可选：截图配置
SCREENSHOT_DISPLAYS=1
SCREENSHOT_MAX_DISPLAYS=6
SCREENSHOT_REQUEST_PERMISSION=1
```

## 开发

```bash
# 安装依赖
npm install

# 构建
npm run build

# 开发模式运行
npm run dev -- status
npm run dev -- capture
npm run dev -- report

# 类型检查
npm run typecheck

# 代码检查
npm run lint
```

## 卸载

```bash
s2r uninstall
rm -rf ~/.screen-report
```

## 说明

- 仅支持 macOS
- 需要屏幕录制权限
- 默认使用 Ollama 本地服务，无需联网
- 支持 OpenAI API 兼容的远程服务
