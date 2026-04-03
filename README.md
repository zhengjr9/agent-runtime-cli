# agent-runtime-cli

`agent-runtime-cli` 是一个参考 Claude 风格 REPL 体验实现的终端对话工具，前端技术栈保持为 `TypeScript + React + Ink`，后端通过本地 bridge 对接 `agent-runtime` 的 A2A `message/stream` 接口。

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

在项目目录执行：

```bash
bun install
bun link
```

完成后可直接使用：

```bash
agent-cli
```

如果你的 shell 还没有包含 Bun bin 目录，请先加入：

```bash
export PATH="$HOME/.bun/bin:$PATH"
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
