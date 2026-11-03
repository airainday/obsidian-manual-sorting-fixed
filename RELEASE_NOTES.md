Manual Sorting Fixed 1.0.0 is an unofficial fork of Manual Sorting 3.2.4.

修复拖动排序时原生 drop 与插件 dragend 重复移动文件夹，导致白板引用反复更新的问题。同目录排序只改变顺序，真正跨目录移动只提交一次。

- 桌面版 Obsidian 1.14.4+。
- 停用原版后安装；首次启用自动导入旧排序数据。
- 不要同时启用原版和本插件。
- 19 项代码级验证通过，包括拖放、取消、多选和设置迁移。

**安装：**下载 `manual-sorting-fixed-1.0.0.zip`，将其中的 `manual-sorting-fixed` 文件夹放入仓库的 `.obsidian/plugins/`，重启后启用。

也可通过 BRAT 添加 `airainday/obsidian-manual-sorting-fixed`。尚未加入 Obsidian 官方社区插件列表。

MIT 许可，保留原作者 kh4f 的版权声明。
