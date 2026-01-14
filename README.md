<div align="center">
  <img src="./logo.png" alt="CyberZen" width="96" height="96" />
  <h1>CyberZen（赛博木鱼）</h1>
  <p>一个基于 <a href="https://tauri.app/">Tauri 2</a> + React + Vite 的桌面悬浮「木鱼」应用：点击/全局快捷键/全局监听，一键积攒功德。</p>
</div>

## 功能概览

- 悬浮木鱼窗口：透明、无边框、置顶，可隐藏/显示
- 窗口体验增强：锁定位置、防误拖、角落停靠、自动淡出
- 点击木鱼积攒功德，并带有动画与飘字效果
- 全局监听键盘/鼠标事件（macOS 需要「输入监控」权限）
- 系统托盘菜单 / 右键快捷菜单：置顶、窗口穿透、透明度、缩放等
- 设置窗口：皮肤、动画速度、透明度、窗口大小、是否显示任务栏图标等
- 统计分析：历史功德与按天统计

## 技术栈

- 前端：React 18、Vite、TypeScript、Tailwind CSS、Zustand、Radix UI、Framer Motion
- 桌面端：Tauri 2（Rust）

## 开发与运行

### 前置依赖

- Node.js `>= 20`（必须配合 `pnpm`）
- Rust stable（用于 Tauri 后端）
- 平台依赖：
  - macOS：Xcode Command Line Tools
  - Linux：`libwebkit2gtk-4.1-dev`、`libappindicator3-dev`、`librsvg2-dev`、`libudev-dev`、`patchelf`、`libx11-dev`、`libxtst-dev`、`libxi-dev`

### 安装依赖

```bash
pnpm install
```

### Web 开发（仅前端）

```bash
pnpm dev
```

默认端口为 `http://localhost:1420`（与 Tauri devUrl 保持一致）。

### 桌面端开发（Tauri）

```bash
pnpm tauri dev
```

### 构建

```bash
pnpm build        # 仅构建前端到 dist/
pnpm tauri build  # 构建桌面安装包/可执行文件
```

## macOS 权限说明（全局监听）

当你开启「全局监听」或启用键盘/鼠标触发时，macOS 需要授予应用「输入监控」权限：

`系统设置 -> 隐私与安全性 -> 输入监控 -> CyberZen`

若已授权但仍不生效：可在该列表中移除应用后重新添加，并重启应用。

## 数据与配置

应用数据存储在 Tauri 的 `appDataDir` 下（设置页可直接打开数据目录）。常见路径示例：

- macOS：`~/Library/Application Support/com.littleq.cyberzen/`
- Windows：`%APPDATA%\\com.littleq.cyberzen\\`
- Linux：`~/.local/share/com.littleq.cyberzen/`

默认会在该目录下保存 `state.json`（包含设置、功德统计、窗口位置等）。

## 安全与隐私

- 本项目完全开源：你可以自行审计代码与构建产物。
- 所有数据默认仅保留在本地（`appDataDir/state.json`），不包含遥测/埋点/分析上报逻辑。
- 全局监听需要系统授权（macOS「输入监控」）：应用只在本地对键盘/鼠标事件做计数统计（包含按键/鼠标按键的累计次数），不记录你输入的文本内容，也不会上传任何输入数据。
- 可能的网络访问仅来自你主动触发的功能：检查/下载安装更新（Tauri Updater）或在“关于”页打开外部链接。

## 项目结构

- `src/`：前端（木鱼主窗口 + 设置窗口）
- `src-tauri/`：Tauri 后端（命令、托盘菜单、全局输入监听、持久化等）
- `public/`：静态资源
- `dist/`：前端构建产物（Tauri 打包使用）


## 许可证

本项目采用 `GPL-3.0-only`，详见 `LICENSE`。
