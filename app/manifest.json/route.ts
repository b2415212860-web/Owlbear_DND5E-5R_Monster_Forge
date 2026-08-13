import { extensionManifest } from "../extension-manifest";

export function GET() {
  return Response.json(extensionManifest, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=300",
      "Cross-Origin-Resource-Policy": "cross-origin",
    },
  });
}
