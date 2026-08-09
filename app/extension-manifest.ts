export const extensionManifest = {
  name: "Bestiary Forge · 5e",
  version: "1.1.0",
  manifest_version: 1,
  description: "5e SRD 怪物图鉴、Token 图片与一键地图投放",
  icon: "/extension-icon.svg",
  action: {
    title: "怪物图鉴",
    icon: "/extension-icon.svg",
    popover: "/",
    width: 460,
    height: 700,
  },
  background_url: "/background",
} as const;
