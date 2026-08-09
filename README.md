# Bestiary Forge · 5e

一个面向 Owlbear Rodeo 的 D&D 5e SRD 怪物图鉴扩展。它提供完整 SRD 怪物目录、逐怪物 Token 图片上传、圆形棋子投放、HP/AC 元数据，以及地图悬停资料卡。

## 使用

1. 部署网站。
2. 在 Owlbear Rodeo 的扩展管理中添加部署地址下的 `/manifest.json`。
3. 打开怪物图鉴，选择怪物并上传自有授权图片；未上传时使用黑色默认图片。
4. 点击“生成 TOKEN”，棋子会按怪物体型投放到当前视口中心。
5. 在 Owlbear Rodeo 的移动工具中选择“鉴定怪物”模式，悬停 Bestiary Forge Token 查看资料卡。

公开部署时，所有玩家都可以读取怪物和 Token。上传、更换或重置图片前，GM 需要点击顶部的“管理”并输入托管环境中的 `UPLOAD_ADMIN_KEY`；验证成功后，口令只保存在当前设备的浏览器中。

## 数据与图片

- 规则数据来自 D&D 5e SRD 2014 API。
- 上传图片会裁成带透明边缘的圆形 PNG，并保存到 R2；D1 保存图片索引元数据。
- 上传和删除接口要求服务器端验证 `UPLOAD_ADMIN_KEY`，公开访问不会暴露该值。
- 图片由使用者自行上传，请仅使用有权使用和分发的素材。

## 本地开发

需要 Node.js `>=22.13.0`。

```bash
npm install
npm run dev
npm run build
npm test
```

数据库结构变更后运行 `npm run db:generate` 生成迁移。
