import fs from "node:fs";
import assert from "node:assert/strict";

const source = fs.readFileSync(
  new URL("./Sidebar.tsx", import.meta.url),
  "utf8",
);

assert.match(
  source,
  /useLayoutEffect/,
  "Sidebar must restore scroll before paint",
);

assert.match(
  source,
  /SIDEBAR_SCROLL_STORAGE_KEY/,
  "Sidebar must use a dedicated scroll storage key",
);

assert.match(
  source,
  /const navScrollRef = useRef<HTMLElement \| null>\(null\)/,
  "Sidebar must retain a ref to its scrollable nav",
);

assert.match(
  source,
  /(?:window\.)?sessionStorage\.getItem\([\s\S]*SIDEBAR_SCROLL_STORAGE_KEY[\s\S]*\)/,
  "Sidebar must read the saved scroll position",
);

assert.match(
  source,
  /nav\.scrollTop = savedScrollTop/,
  "Sidebar must restore the exact saved scrollTop",
);

assert.match(
  source,
  /(?:window\.)?sessionStorage\.setItem\([\s\S]*SIDEBAR_SCROLL_STORAGE_KEY[\s\S]*String\(nav\.scrollTop\)/,
  "Sidebar must save the latest scrollTop during cleanup",
);

assert.match(
  source,
  /<nav[\s\S]*ref=\{navScrollRef\}/,
  "The ref must be attached to the scrollable nav",
);

assert.doesNotMatch(
  source,
  /scroll=\{false\}/,
  "Sidebar links must not disable Next page scroll behavior",
);

console.log("SIDEBAR-SCROLL-RETENTION-1 contract PASS");
