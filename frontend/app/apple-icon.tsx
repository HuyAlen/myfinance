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
// Visual design mirrors the existing public/icon-192.svg / icon-512.svg
// brand mark (blue background, centered white ₫ mark) for consistency
// with the Android/PWA manifest icons, but WITHOUT that SVG's baked-in
// rounded corners — iOS applies its own corner mask and subtle shine to
// apple-touch-icons, so a source image with corners already rounded would
// get double-rounded / show mismatched corner artifacts.

export const size = {
  width: 180,
  height: 180,
};

export const contentType = "image/png";

export default function AppleIcon() {
  // Draws a "₫"-style mark (a barred D, the Vietnamese Dong sign) from a
  // plain ASCII "D" glyph plus a CSS-drawn strike bar, instead of the "₫"
  // character itself. satori (ImageResponse's renderer) has no system font
  // access at build time and its automatic dynamic-font fallback for
  // uncommon codepoints like U+20AB isn't reliably reachable in every build
  // environment — confirmed by rendering it and finding a broken-glyph
  // placeholder in the output. "D" is basic Latin, covered by the default
  // bundled font with no network/font lookup involved, so this renders
  // identically and reliably everywhere.
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
            width: 132,
            height: 132,
            borderRadius: "50%",
            border: "6px solid rgba(255,255,255,0.25)",
          }}
        >
          <span
            style={{
              fontSize: 96,
              fontWeight: 900,
              color: "#ffffff",
              lineHeight: 1,
            }}
          >
            D
          </span>
          <div
            style={{
              position: "absolute",
              width: 58,
              height: 9,
              borderRadius: 4,
              background: "#2563eb",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
            }}
          />
        </div>
      </div>
    ),
    { ...size },
  );
}
