import Link from "next/link";

const sourceCommit = "190ba73862e65b1b7c293289beb2ef915c1803ff";
const sourceTree = `https://github.com/DND5eChm/DND5e_chm/tree/${sourceCommit}/%E6%80%AA%E7%89%A9%E5%9B%BE%E9%89%B4`;

export const metadata = {
  title: "数据来源与许可 · Bestiary Forge",
  description: "D&D 2014 / 5E 不全书中文资料与 2024 / 5R SRD 中文资料的数据范围、审计方式和许可说明。",
};

export default function SourcesPage() {
  return (
    <main className="sources-page">
      <article className="sources-document">
        <p className="eyebrow">Data provenance</p>
        <h1>数据来源与许可</h1>
        <p className="lead">5E 与 5R 使用两套不同来源。每张资料卡都保留中英文名称；5E 另外保留精确提交、原始 HTML 路径、页内区块编号及原页链接，便于逐条审计。</p>

        <h2>2014 / 5E：DND5e不全书</h2>
        <p>5E 图鉴已替换为 424 张中文资料卡。来源是 <a href={sourceTree} target="_blank" rel="noreferrer">DND5eChm/DND5e_chm 的“怪物图鉴”目录</a>，固定在提交 <code>{sourceCommit}</code>。转换器扫描 344 个 GBK / GB2312 旧式 HTML 文件，在 290 个含数据块的页面中识别出 424 个怪物资料块，再输出 UTF-8 JSON。</p>
        <p>生成过程不会依赖运行时第三方 API。每条 JSON 记录包含 <code>name_en</code>、<code>source_file</code>、<code>source_url</code>、<code>source_commit</code> 与 <code>source_block</code>，可以把站内数值和文本追溯到指定提交中的原页。</p>
        <p><a href="/api/datasets/5e" target="_blank" rel="noreferrer">下载规范化 5E JSON</a> · <a href="/api/audit/5e" target="_blank" rel="noreferrer">查看 5E 审计清单</a></p>

        <h2>2024 / 5R：SRD 5.2</h2>
        <p>5R 图鉴包含 328 张 SRD 5.2 中文资料卡。中文整理以 <a href="https://github.com/DND5eChm/SRD5.2Chm" target="_blank" rel="noreferrer">DND5eChm/SRD5.2Chm</a> 为基础，并用 Foundry D&amp;D 5e 中标记为 CC-BY-4.0 的 2024 actor 数据核对核心字段；缺失的 Darkmantle 与 Knight 由项目补译。</p>

        <h2>许可边界</h2>
        <p>指定 5E 来源仓库根目录的 <code>LICENSE</code> 声明 GNU GPL v3.0；本项目保留该来源、提交和逐条追溯信息。仓库许可证不应被误读为 Wizards of the Coast 对所有底层官方内容作出的 CC 授权，部署者仍应按自己的发布范围评估相关权利。</p>
        <p className="license-quote">This work includes material from the System Reference Document 5.2 (“SRD 5.2”) by Wizards of the Coast LLC, available at <a href="https://www.dndbeyond.com/srd" target="_blank" rel="noreferrer">dndbeyond.com/srd</a>. The SRD 5.2 is licensed under the <a href="https://creativecommons.org/licenses/by/4.0/legalcode" target="_blank" rel="noreferrer">Creative Commons Attribution 4.0 International License</a>.</p>

        <h2>非官方声明</h2>
        <p>“Dungeons &amp; Dragons”及相关标识属于 Wizards of the Coast。本项目不是 Wizards of the Coast 的官方产品，也未获得其认可或赞助；这里的中文内容是社区资料与非官方整理，不是官方中文译本。</p>

        <Link className="back-link" href="/">← 返回怪物图鉴</Link>
      </article>
    </main>
  );
}
