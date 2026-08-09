import { ImageResponse } from "next/og";

// Next.js App Router file convention: generates the PNG iOS actually needs
// for "Add to Home Screen" and injects the correct
// <link rel="apple-touch-icon" ... type="image/png" sizes="180x180"> tag
// automatically — no manual metadata.icons.apple entry needed (and one
// must not coexist with this file, or iOS gets two conflicting icon
// declarations). Rendered at build time via next/og's ImageResponse
// (bundled with Next.js), so no new dependency and no external image
// asset/rasterizer is required.
//
// Approved brand direction (PWA-ICON-1.1): flat brand-blue square, a
// centered "MM" monogram, and a subtle inner ring for depth. No outer
// corner rounding here — iOS applies its own Home Screen mask, so a
// pre-rounded source image would get double-rounded.
//
// "MM" is plain ASCII text, deliberately: an earlier attempt used the "₫"
// character and satori (ImageResponse's renderer) has no system font
// access at build time — its automatic dynamic-font fallback for uncommon
// codepoints isn't reliably reachable in every build environment,
// confirmed by rendering it and finding a broken-glyph placeholder in the
// output. Basic Latin letters are covered by the default bundled font with
// no network/font lookup involved, so this renders identically everywhere.

export const size = {
  width: 180,
  height: 180,
};

export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#2563eb",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            position: "relative",
            width: 146,
            height: 146,
            borderRadius: "50%",
            border: "5px solid rgba(255,255,255,0.3)",
          }}
        >
          <span
            style={{
              fontSize: 74,
              fontWeight: 800,
              letterSpacing: -2,
              color: "#ffffff",
              lineHeight: 1,
            }}
          >
            MM
          </span>
        </div>
      </div>
    ),
    { ...size },
  );
}
