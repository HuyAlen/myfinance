/**
 * SETTINGS-DESKTOP-SCROLLSPY-1
 * Resolve the current Settings section from the finance-main scrollport.
 * The order is the same as the Settings navigation/DOM order.
 * The caller supplies viewport-relative top coordinates; this helper is pure.
 */
export type SettingsSectionPosition = Readonly<{
  id: string;
  top: number;
}>;

export function resolveActiveSettingsSection(
  sections: readonly SettingsSectionPosition[],
  activationLine: number,
  atScrollEnd = false,
): string | null {
  if (sections.length === 0) return null;
  if (atScrollEnd) return sections[sections.length - 1].id;

  // Before the first section starts, the first navigation item stays active.
  let selected = sections[0].id;
  for (const section of sections) {
    if (section.top > activationLine) break;
    selected = section.id;
  }
  return selected;
}
