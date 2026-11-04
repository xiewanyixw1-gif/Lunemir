import type { MetadataRoute } from "next";

export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Lunemir",
    short_name: "Lunemir",
    description: "A world that remembers you.",
    start_url: "/",
    display: "standalone",
    background_color: "#080715",
    theme_color: "#0d0a24",
    icons: [
      {
        src: "/lunemir-icon.png",
        sizes: "1024x1024",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
