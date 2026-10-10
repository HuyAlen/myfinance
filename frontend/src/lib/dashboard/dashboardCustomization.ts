export const DASHBOARD_CUSTOMIZATION_STORAGE_KEY =
  "myfinance:dashboard-customization-v1";

export const DASHBOARD_CUSTOMIZATION_SECTIONS = [
  {
    id: "decision",
    label: "Quyết định chi tiêu",
    description: "Mức có thể chi an toàn và dự báo dòng tiền 90 ngày",
  },
  {
    id: "budget",
    label: "Ngân sách",
    description: "Tình trạng ngân sách và khoản vượt hạn mức",
  },
  {
    id: "month-progress",
    label: "Tiến độ tháng",
    description: "Tiến độ thời gian và nhịp chi tiêu trong tháng",
  },
  {
    id: "cash-flow",
    label: "Dòng tiền & cơ cấu",
    description: "Dòng tiền trong kỳ và cấu trúc tài chính",
  },
  {
    id: "review",
    label: "So sánh & rà soát",
    description: "So với kỳ trước và hàng đợi Transaction Review",
  },
  {
    id: "closeout",
    label: "Dữ liệu & chốt tháng",
    description: "Sức khỏe dữ liệu, closeout và lịch sử review tháng",
  },
  {
    id: "recurring",
    label: "Recurring & chi tiêu",
    description: "Khoản sắp đến hạn và nhóm chi tiêu nổi bật",
  },
  {
    id: "wealth",
    label: "Tài sản & phân bổ",
    description: "Attribution Net Worth và phân bổ đầu tư",
  },
  {
    id: "portfolio",
    label: "Forex, mục tiêu & giao dịch",
    description: "Tài khoản Forex, mục tiêu tài chính và hoạt động gần đây",
  },
  {
    id: "today",
    label: "Tổng quan hôm nay",
    description: "Snapshot thu, chi, phân bổ và dòng tiền ròng trong ngày",
  },
] as const;

export type DashboardSectionId =
  (typeof DASHBOARD_CUSTOMIZATION_SECTIONS)[number]["id"];

export type DashboardCustomization = {
  version: 1;
  order: DashboardSectionId[];
  hidden: DashboardSectionId[];
};

const SECTION_IDS = DASHBOARD_CUSTOMIZATION_SECTIONS.map(
  (section) => section.id,
) as DashboardSectionId[];
const SECTION_ID_SET = new Set<DashboardSectionId>(SECTION_IDS);

export function createDefaultDashboardCustomization(): DashboardCustomization {
  return {
    version: 1,
    order: [...SECTION_IDS],
    hidden: [],
  };
}

export function normalizeDashboardCustomization(
  value: unknown,
): DashboardCustomization {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return createDefaultDashboardCustomization();
  }

  const candidate = value as {
    order?: unknown;
    hidden?: unknown;
  };

  const normalizedOrder: DashboardSectionId[] = [];
  if (Array.isArray(candidate.order)) {
    for (const rawId of candidate.order) {
      if (
        typeof rawId === "string" &&
        SECTION_ID_SET.has(rawId as DashboardSectionId) &&
        !normalizedOrder.includes(rawId as DashboardSectionId)
      ) {
        normalizedOrder.push(rawId as DashboardSectionId);
      }
    }
  }

  for (const id of SECTION_IDS) {
    if (!normalizedOrder.includes(id)) normalizedOrder.push(id);
  }

  const hidden: DashboardSectionId[] = [];
  if (Array.isArray(candidate.hidden)) {
    for (const rawId of candidate.hidden) {
      if (
        typeof rawId === "string" &&
        SECTION_ID_SET.has(rawId as DashboardSectionId) &&
        !hidden.includes(rawId as DashboardSectionId)
      ) {
        hidden.push(rawId as DashboardSectionId);
      }
    }
  }

  return {
    version: 1,
    order: normalizedOrder,
    hidden,
  };
}

export function moveDashboardSection(
  customization: DashboardCustomization,
  sectionId: DashboardSectionId,
  direction: "up" | "down",
): DashboardCustomization {
  const normalized = normalizeDashboardCustomization(customization);
  const currentIndex = normalized.order.indexOf(sectionId);
  if (currentIndex === -1) return normalized;

  const nextIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
  if (nextIndex < 0 || nextIndex >= normalized.order.length) return normalized;

  const order = [...normalized.order];
  [order[currentIndex], order[nextIndex]] = [order[nextIndex], order[currentIndex]];

  return { ...normalized, order };
}

// Drag/drop uses the destination index in the order AFTER removing the dragged
// item. Keep hidden modules in the same canonical order so re-showing them
// restores the user's chosen position; never mutate existing preference state.
export function reorderDashboardSection(
  customization: DashboardCustomization,
  sectionId: DashboardSectionId,
  targetIndex: number,
): DashboardCustomization {
  const normalized = normalizeDashboardCustomization(customization);
  const currentIndex = normalized.order.indexOf(sectionId);
  if (
    currentIndex === -1 ||
    !Number.isInteger(targetIndex) ||
    targetIndex < 0 ||
    targetIndex >= normalized.order.length ||
    currentIndex === targetIndex
  ) {
    return normalized;
  }
  const order = [...normalized.order];
  order.splice(currentIndex, 1);
  order.splice(targetIndex, 0, sectionId);
  return { ...normalized, order };
}

export function toggleDashboardSection(
  customization: DashboardCustomization,
  sectionId: DashboardSectionId,
): DashboardCustomization {
  const normalized = normalizeDashboardCustomization(customization);
  const hidden = normalized.hidden.includes(sectionId)
    ? normalized.hidden.filter((id) => id !== sectionId)
    : [...normalized.hidden, sectionId];

  return { ...normalized, hidden };
}

export function isDashboardSectionVisible(
  customization: DashboardCustomization,
  sectionId: DashboardSectionId,
) {
  return !normalizeDashboardCustomization(customization).hidden.includes(sectionId);
}

export function getDashboardSectionOrder(
  customization: DashboardCustomization,
  sectionId: DashboardSectionId,
) {
  const index = normalizeDashboardCustomization(customization).order.indexOf(sectionId);
  return index === -1 ? SECTION_IDS.length : index;
}

export function readDashboardCustomization(): DashboardCustomization {
  if (typeof window === "undefined") return createDefaultDashboardCustomization();
  try {
    const raw = window.localStorage.getItem(DASHBOARD_CUSTOMIZATION_STORAGE_KEY);
    if (!raw) return createDefaultDashboardCustomization();
    return normalizeDashboardCustomization(JSON.parse(raw));
  } catch {
    return createDefaultDashboardCustomization();
  }
}

export function persistDashboardCustomization(
  customization: DashboardCustomization,
) {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(
      DASHBOARD_CUSTOMIZATION_STORAGE_KEY,
      JSON.stringify(normalizeDashboardCustomization(customization)),
    );
    return true;
  } catch {
    return false;
  }
}
