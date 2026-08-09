export const extensionManifest = {
  name: "Bestiary Forge · 5e",
  version: "2.0.0",
  manifest_version: 1,
  description: "收藏 D&D 5e SRD 怪物，并在标签页资料卡中快速切换",
  icon: "/extension-icon.svg",
  action: {
    title: "怪物收藏图鉴",
    icon: "/extension-icon.svg",
    popover: "/",
    width: 460,
    height: 700,
  },
} as const;
