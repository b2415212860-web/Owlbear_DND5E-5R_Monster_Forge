# Bestiary Forge · 5e

一个面向 Owlbear Rodeo 的 D&D 5e SRD 怪物收藏图鉴。它提供完整怪物目录、搜索、星标收藏，以及可像浏览器标签页一样快速切换的完整怪物资料卡。

## 使用

1. 部署网站。
2. 在 Owlbear Rodeo 的扩展管理中添加部署地址下的 `/manifest.json`。
3. 打开怪物收藏图鉴，在左侧目录搜索怪物。
4. 点击怪物右侧的星标，将资料卡加入右侧标签栏；点击标签切换怪物，点击 `×` 或再次点击星标即可移除。

收藏通过 `localStorage` 保存在当前浏览器和设备中，不会上传到服务器，也不会在不同设备之间同步。

## 数据

- 规则数据来自 D&D 5e SRD 2014 API。
- 应用只读取公开规则数据，不包含图片上传、Token 生成、地图投放或管理员功能。

## 本地开发

需要 Node.js `>=22.13.0`。

```bash
npm install
npm run dev
npm run build
npm test
```
