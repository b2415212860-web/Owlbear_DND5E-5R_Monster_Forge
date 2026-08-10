# Bestiary Forge · D&D 5E / 5R 中文怪物图鉴

一个面向 Owlbear Rodeo 的中文怪物收藏图鉴。它内置 424 张来自 DND5e不全书指定提交的 2014 / 5E 中文资料卡，以及 328 张 2024 / 5R SRD 5.2 中文资料卡，支持原图鉴目录分类、分类筛选、版本切换、中英文搜索、星标收藏和浏览器式资料卡标签页。

## 使用

1. 部署网站。
2. 在 Owlbear Rodeo 的扩展管理中添加部署地址下的 `/manifest.json`。
3. 打开怪物收藏图鉴，通过目录顶部的 `5E` / `5R` 按钮切换规则版本；可按原图鉴分类筛选，也可直接搜索中英文名称。
4. 点击怪物右侧的星标，将资料卡加入右侧标签栏；点击标签上的 `×` 或再次点击星标即可移除。

收藏通过 `localStorage` 保存在当前浏览器和设备中，不会上传到服务器，也不会在不同设备之间同步。

## 数据

- 5E 数据来自 [DND5eChm/DND5e_chm](https://github.com/DND5eChm/DND5e_chm) 的固定提交 `190ba73862e65b1b7c293289beb2ef915c1803ff`，由旧式 GBK / GB2312 中文 HTML 转换为 UTF-8 JSON。
- 5E 每条记录均保留英文名、原始文件、精确提交、页内区块编号和原页链接；完整审计说明见 [`data/README.md`](data/README.md)。
- 5R 为 SRD 5.2 中文整理，完整许可与署名见 [`data/ATTRIBUTION.md`](data/ATTRIBUTION.md)。
- 数据随应用本地发布，不依赖外部怪物 API，因此不会因为远程接口不可用而出现 `Failed to fetch`。
- 应用不包含图片上传、Token 生成、地图投放或管理员功能。

## 本地开发

需要 Node.js `>=22.13.0`。把指定提交的源仓库放到 `work/dnd5e-chm-190ba7` 后运行：

```bash
npm install
npm run data:build
npm run dev
npm run build
npm test
```
