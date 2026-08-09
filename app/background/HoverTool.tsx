"use client";

import { useEffect } from "react";

const META_KEY = "com.shen.owlbear-bestiary/monster";
const MODE_ID = "com.shen.owlbear-bestiary/inspect-mode";
const CARD_ID = "com.shen.owlbear-bestiary/monster-card";

interface MonsterMetadata {
  index?: string;
  name?: string;
}

export function HoverTool() {
  useEffect(() => {
    let activeIndex: string | null = null;
    let disposed = false;
    let cleanup = () => {};

    void import("@owlbear-rodeo/sdk").then(({ default: OBR }) => {
      if (disposed || !OBR.isAvailable) return;
      OBR.onReady(async () => {
        try {
          await OBR.tool.removeMode(MODE_ID);
        } catch {
          // The mode has not been registered yet.
        }
        if (disposed) return;

        await OBR.tool.createMode({
        id: MODE_ID,
        icons: [
          {
            icon: "/extension-icon.svg",
            label: "鉴定怪物",
            filter: { activeTools: ["rodeo.owlbear.tools/move"] },
          },
        ],
        shortcut: "I",
        cursors: [{ cursor: "help" }],
        onToolClick: () => true,
        onToolMove: async (_context, event) => {
          const metadata = event.target?.metadata[META_KEY] as MonsterMetadata | undefined;
          const index = typeof metadata?.index === "string" ? metadata.index : null;

          if (!index) {
            if (activeIndex) {
              activeIndex = null;
              await OBR.popover.close(CARD_ID).catch(() => undefined);
            }
            return;
          }
          if (index === activeIndex) return;
          activeIndex = index;
          await OBR.popover.close(CARD_ID).catch(() => undefined);
          await OBR.popover.open({
            id: CARD_ID,
            url: `/card?index=${encodeURIComponent(index)}`,
            width: 326,
            height: 390,
            anchorReference: "POSITION",
            anchorPosition: {
              left: event.pointerPosition.x + 18,
              top: event.pointerPosition.y + 16,
            },
            anchorOrigin: { horizontal: "LEFT", vertical: "TOP" },
            transformOrigin: { horizontal: "LEFT", vertical: "TOP" },
            hidePaper: true,
            disableClickAway: true,
            marginThreshold: 12,
          });
        },
        onActivate: () => {
          OBR.notification.show("悬停 Bestiary Forge Token 可查看怪物资料", "INFO");
        },
        onDeactivate: () => {
          activeIndex = null;
          OBR.popover.close(CARD_ID).catch(() => undefined);
        },
        });
      });

      cleanup = () => {
        OBR.popover.close(CARD_ID).catch(() => undefined);
        OBR.tool.removeMode(MODE_ID).catch(() => undefined);
      };
    });

    return () => {
      disposed = true;
      cleanup();
    };
  }, []);

  return <span className="sr-only">Bestiary Forge hover tool</span>;
}
