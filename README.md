# screen2report (Swift)

本地模型服务管理工具（macOS）。

## 功能

- **自动模型管理**：安装时自动检测、下载并启动模型服务
- **简洁 CLI**：仅三个命令（start / stop / status）
- **OpenAI 兼容**：提供 http://127.0.0.1:18279/v1 标准接口

## 快速开始

### 一键安装

```bash
curl -fsSL https://raw.githubusercontent.com/oryx2/s2r/main/install.sh | bash
```

安装脚本会自动：
1. 下载并解压应用包
2. 检查本地模型，如存在则自动启动服务
3. 如模型不存在，提示手动下载

### CLI 命令

```bash
# 启动模型服务（后台运行）
s2r start

# 查看服务状态
s2r status

# 停止模型服务
s2r stop
```

服务启动后，API 地址：`http://127.0.0.1:18279/v1`

### 使用其他模型

```bash
curl -fsSL https://raw.githubusercontent.com/oryx2/s2r/main/install.sh | bash -s -- --model-repo-id Qwen/Qwen2.5-1.5B
```

### 跳过模型检查

如果已有模型或想手动管理：

```bash
curl -fsSL https://raw.githubusercontent.com/oryx2/s2r/main/install.sh | bash -s -- --skip-model-check
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
│   └── llama-server     # llama.cpp 服务端（可选）
├── logs/
│   └── model_server.log # 服务日志
├── run/
│   └── model_server.pid # 进程 PID
└── .env                 # 环境配置
```

## 手动构建

```bash
# 构建 Swift 二进制
bash scripts/build_swift_binaries.sh

# 构建发布包
bash scripts/build_release.sh --version v0.1.0

# 包含 llama-server 运行时
bash scripts/build_release.sh --version v0.1.0 --bundle-llama-runtime
```

## 打包分发

发布包产物：

- `dist/screen2report-<version>-macos.tar.gz`
- `dist/screen2report-<version>-macos.tar.gz.sha256`
- `dist/LATEST`

远程安装需托管到 GitHub Releases：
- `install.sh` → 放到仓库根目录或 GitHub Pages
- 发布包 → 上传到 GitHub Releases

## 卸载

```bash
bash scripts/uninstall_launchd.sh
rm -rf ~/.screen-report
```

## 说明

- 仅支持 macOS
- 模型默认优先从 ModelScope 下载，失败时回退到 Hugging Face
- 服务日志：`~/.screen-report/logs/model_server.log`
