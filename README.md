# Manual Sorting Fixed

An unofficial fork of [Manual Sorting 3.2.4](https://github.com/kh4f/obsidian-manual-sorting/tree/3.2.4) by kh4f. It fixes duplicate folder moves when manually reordering items in Obsidian's file explorer.

**修复拖动排序时文件夹被临时移入其他目录、白板反复更新引用的问题。**

When the pointer is over a folder, Obsidian's native `drop` handler can enqueue a move into it. The original plugin also handles `dragend` and enqueues a move to the sorting destination. These asynchronous operations can move a folder in and back out, updating the same Canvas card twice. This fork claims internal drops before the native handler and skips same-path renames.

## 安装

需要桌面版 Obsidian **1.14.4 或更新版本**。

1. 如已安装原版 Manual Sorting，先停用它，暂时保留原目录以便迁移排序数据。
2. 从 [Releases](https://github.com/airainday/obsidian-manual-sorting-fixed/releases/latest) 下载 `manual-sorting-fixed-1.0.0.zip`。
3. 完全退出 Obsidian，将 ZIP 中的 `manual-sorting-fixed` 文件夹放到仓库的 `.obsidian/plugins/` 下。
4. 重新启动，在“设置 → 第三方插件”中启用 **Manual Sorting Fixed**。
5. 首次启用时自动导入原版 `data.json` 中的排序设置。确认顺序正常后，可以卸载原版。

正确目录结构：

```text
<vault>/.obsidian/plugins/manual-sorting-fixed/
├── main.js
├── manifest.json
└── styles.css
```

不要同时启用原版和本插件。安装时重启 Obsidian 可清除旧版停用后可能遗留的监听器。

也可以通过 [BRAT](https://github.com/TfTHacker/obsidian42-brat) 添加仓库 `airainday/obsidian-manual-sorting-fixed`。本插件尚未加入 Obsidian 官方社区插件列表。

## 排序数据与多设备

- 独立插件 ID：`manual-sorting-fixed`，原版更新不会覆盖此目录。
- 新排序数据保存在 `.obsidian/plugins/manual-sorting-fixed/data.json`。
- 仅在新插件尚无设置时导入 `.obsidian/plugins/manual-sorting/data.json`，已有设置不会被覆盖。
- 已删除原版时也可全新安装；如有旧 `data.json` 备份，可在插件停用时复制到新目录。
- 其他电脑可安装同一 ZIP。如果同步包含新插件目录，文件和排序数据也可随仓库同步，再按需在各设备启用插件。
- 发行包不包含个人排序数据或笔记。

## 修复内容

- 接管资源管理器内部的排序 drop，避免与原生移动重复执行。
- 同目录排序不调用重命名，真正跨目录移动只提交一次。
- 取消拖动和无效落点不执行内部移动。
- 外部拖入、拖到资源管理器外仍由原生处理。
- 保留多选排序和跨目录移动。
- 首次启用迁移旧排序设置，并使用 Obsidian 生命周期 API 清理仓库监听器。

同目录排序仍会保存插件自身的排序数据，相关同步是正常的；它应当不再引发文件夹来回移动和连带的白板引用更新。

## 开发与验证

运行环境：Node.js 18+，重建插件另需 Python 3.10+。

```sh
npm install
npm run check
npm test
python scripts/build_plugin.py
```

`main.js` 可以从 MIT 许可的上游 3.2.4 fixture 重建，构建脚本严格匹配修改点。仓库保留原始压缩代码以便复现，修改逻辑可直接在 `scripts/build_plugin.py` 中查看。

另有 11 项拖放回归检查，读取本机安装的 Obsidian **1.14.4** 程序资源，文件系统和拖放目标使用内存替身。它不包含或分发 Obsidian 程序代码，不操作真实笔记：

```powershell
$env:OBSIDIAN_ASAR = '你的 Obsidian 1.14.4 asar 文件绝对路径'
npm run test:drag
```

验证包括原问题复现、修复后排序、跨目录、取消、多选、外部拖放及设置迁移，共 19 项代码级检查。桌面 Windows / Obsidian 1.14.4 已验证；尚未覆盖其他版本和移动端。

## 来源与许可证

原项目：[kh4f/obsidian-manual-sorting](https://github.com/kh4f/obsidian-manual-sorting)，基于其 `3.2.4` 版本修改。MIT 许可证，保留原作者版权声明，详见 [LICENSE](LICENSE)。本仓库为独立维护的非官方分支。
