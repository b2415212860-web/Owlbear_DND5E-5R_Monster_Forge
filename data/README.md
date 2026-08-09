# D&D 5E / 5R 中文怪物数据库

运行时直接使用两套本地 JSON 数据库：`srd51-monsters.zh-CN.json` 含 424 张 D&D 2014 / 5E 中文资料卡，`srd52-monsters.zh-CN.json` 含 328 张 D&D 2024 / 5R SRD 5.2 中文资料卡。网站不依赖第三方怪物 API。

## 5E 来源与结构

- 来源仓库：[`DND5eChm/DND5e_chm`](https://github.com/DND5eChm/DND5e_chm)
- 固定提交：`190ba73862e65b1b7c293289beb2ef915c1803ff`
- 源目录：`怪物图鉴`
- 源编码：GBK / GB2312 旧式 HTML
- 输出：UTF-8 JSON
- 仓库许可证标注：GNU GPL v3.0

`scripts/build-srd51-monsters.mjs` 会先校验源仓库 HEAD 与许可证，再递归扫描 HTML。当前审计结果为：344 个 HTML 文件、290 个含资料块的页面、424 个怪物资料块、424 个唯一英文名称、0 个必填字段警告。

每条 5E 记录保留：

- `name` 与 `name_en`：中文名及逐条核对用英文名；
- `source_file`：原始 HTML 相对路径；
- `source_url`：精确提交中的 GitHub 原页；
- `source_commit`：固定提交哈希；
- `source_block`：同一 HTML 内的资料块序号；
- 完整中文属性、战斗字段、特质、动作、反应、传奇动作与源页可识别的其他段落。

`srd51-monsters.audit.json` 记录扫描汇总、每个页面识别到的资料块数，以及每条输出记录到源页的映射。部署后也可访问 `/api/audit/5e` 和 `/api/datasets/5e`。

## 重新生成

将固定提交检出到 `work/dnd5e-chm-190ba7`，然后运行：

```sh
npm run data:build:5e
```

脚本会拒绝其他提交、缺少 GPL v3.0 根许可证的副本，以及识别结果低于安全阈值的输入。5R 的生成与核对仍由 `scripts/build-srd52-monsters.mjs` 完成。

## 许可说明

5E 指定来源仓库的根许可证是 GPL v3.0。该仓库许可证不应被理解为 Wizards of the Coast 对所有底层官方内容作出的 CC 授权。5R SRD 5.2 内容使用 CC BY 4.0；完整署名和非官方声明见 [`ATTRIBUTION.md`](./ATTRIBUTION.md)。
