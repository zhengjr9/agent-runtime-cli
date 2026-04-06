# agent-runtime-cli

`agent-runtime-cli` 是一个 REPL 体验实现的终端对话工具，前端技术栈保持为 `TypeScript + React + Ink`，后端通过本地 bridge 对接 `agent-runtime` 的 A2A `message/stream` 接口。

当前能力：

- `agent-cli` 单命令启动
- 首次启动自动引导设置 upstream
- 自动启动本地 bridge
- 启动页显示当前连接目标
- 本地 session 保存与恢复
- `/upstream` 设置上游地址
- `/resume` 查看并选择本地 session
- `/exit` 退出当前会话

## 环境要求

- `bun >= 1.3.5`
- `node >= 24`

## 安装

推荐直接运行安装脚本：

```bash
sh install.sh
```

脚本会：

- 按当前系统和架构选择预编译二进制
- 优先安装本地已存在的 `dist/agent-cli`
- 否则从 GitHub Release 下载对应产物
- 安装到 `~/.agent-runtime-cli/local/versions/<version>/agent-cli`
- 在 `~/.local/bin/agent-cli` 创建软链接

如果你就是在本仓库里本地测试，并且已经有：

```text
dist/agent-cli
```

脚本会直接安装这个本地产物，不再执行 `bun run build`。

安装完成后可直接使用：

```bash
agent-cli
```

如果你的 shell 还没有包含 `~/.local/bin`，请先加入：

```bash
export PATH="$HOME/.local/bin:$PATH"
```

## 使用

启动交互会话：

```bash
agent-cli
```

恢复最近一次会话：

```bash
agent-cli resume
```

恢复指定会话：

```bash
agent-cli resume <session-id>
```

查看帮助：

```bash
agent-cli --help
```

## 首次启动

如果本地还没有保存 upstream，启动时会先进入一个类似登录的配置流程，要求输入 upstream base URL，例如：

```text
http://127.0.0.1:8080/aaa-man/
```

保存后程序会自动拼接为：

```text
http://127.0.0.1:8080/aaa-man/a2a/v1
```

启动页左下角会显示当前连接目标，例如：

```text
~/.../agent-runtime-cli in 127.0.0.1:8080/aaa-man/a2a/v1
```

配置会持久化到：

```text
.local-state/<user>/a2a-runtime.json
```

## TUI 命令

在会话内可使用：

- `/upstream`
- `/resume`
- `/exit`

其中：

- `/upstream` 会弹出输入框设置 upstream
- `/resume` 会弹出本地 session 列表

## 默认配置

默认值如下：

- bridge: `http://127.0.0.1:4317`
- upstream base: `http://127.0.0.1:8080/aaa-man/`
- endpoint: `http://127.0.0.1:8080/aaa-man/a2a/v1`
- proxy: `http://127.0.0.1:9092`

## 开发

手动启动 bridge：

```bash
bun run bridge
```

直接运行入口：

```bash
bun run start
```

## 单文件二进制

安装脚本使用的就是预编译单文件二进制方案，不依赖目标机器本地 Bun/Node 运行时。

如果你在源码仓库里本地测试，也可以直接运行已有产物：

```bash
./dist/agent-cli
```

注意：

- 这只是“不依赖本地 Bun/Node 环境”，不是离线运行
- 目标机器仍然需要能访问你的 upstream A2A 服务
- 如果 upstream 依赖本地代理，例如 `http://127.0.0.1:9092`，目标机器也仍然需要这个代理服务

## 离线安装包

如果你要分发“当前这份带 UI 的代码”，不要用旧的 `dist/agent-cli`。应当使用离线源码运行包。

先在有完整依赖的机器上打包：

```bash
sh scripts/package-offline.sh
```

也可以一次生成多个目标包：

```bash
sh scripts/package-offline.sh linux-amd64 windows-x86
```

如果你要一次把常用平台全部打出来：

```bash
sh scripts/package-offline.sh --all
```

或者：

```bash
sh scripts/package-offline-all.sh
```

默认会生成当前平台对应的：

```text
dist-offline/agent-runtime-cli-offline-<version>-<os>-<arch>.tar.gz
```

这个离线包包含：

- 当前 `src`
- 当前 `node_modules`
- `shims`
- `package.json`
- `bun.lock`
- `bunfig.toml`
- `.npmrc`
- `install-offline.sh`
- 可选的 `bun` 二进制

对于当前平台，默认会把本机 `~/.bun/bin/bun` 一起打进包里，所以目标机器不需要额外安装 Bun。

对于跨平台目标：

- 如果没有提供该目标平台的 bun，可照常生成源码离线包
- 安装后会优先尝试本地 `bun`
- 如果没有 `bun`，会继续尝试本地 `node --import tsx`

当前已支持的目标写法包括：

- `darwin-arm64`
- `darwin-amd64`
- `linux-amd64`
- `linux-arm64`
- `windows-amd64`
- `windows-x86`

在类 Unix 目标机器上安装：

```bash
tar -xzf agent-runtime-cli-offline-<version>-<os>-<arch>.tar.gz
cd agent-runtime-cli-offline-<version>-<os>-<arch>
sh install.sh
```

在 Windows 目标机器上安装：

```powershell
tar -xzf agent-runtime-cli-offline-<version>-windows-x86.tar.gz
cd agent-runtime-cli-offline-<version>-windows-x86
powershell -ExecutionPolicy Bypass -File .\install.ps1
```

安装完成后直接运行：

```bash
agent-cli
```

离线安装会把当前 UI 版项目放到：

```text
~/.agent-runtime-cli/offline/current
```

并在下面创建命令入口：

```text
~/.local/bin/agent-cli
```
