"use client";

import type { AIFinanceAISettings } from "./aiPromptTypes";
import {
  AI_SETTINGS_STORAGE_KEY,
  DEFAULT_AI_FINANCE_SETTINGS,
  maskAIFinanceApiKey,
  normalizeAIFinanceSettings,
} from "./aiSettings";

export {
  AI_SETTINGS_STORAGE_KEY,
  DEFAULT_AI_FINANCE_SETTINGS,
  maskAIFinanceApiKey,
  normalizeAIFinanceSettings,
};

export function getAIFinanceSettings(): AIFinanceAISettings {
  if (typeof window === "undefined") return DEFAULT_AI_FINANCE_SETTINGS;

  try {
    const raw = window.localStorage.getItem(AI_SETTINGS_STORAGE_KEY);
    if (!raw) return DEFAULT_AI_FINANCE_SETTINGS;
    return normalizeAIFinanceSettings(JSON.parse(raw));
  } catch {
    return DEFAULT_AI_FINANCE_SETTINGS;
  }
}

export function saveAIFinanceSettings(
  settings: Partial<AIFinanceAISettings>,
): AIFinanceAISettings {
  const normalized = normalizeAIFinanceSettings(settings);

  if (typeof window !== "undefined") {
    window.localStorage.setItem(
      AI_SETTINGS_STORAGE_KEY,
      JSON.stringify(normalized),
    );
  }

  return normalized;
}

export function clearAIFinanceSettings() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(AI_SETTINGS_STORAGE_KEY);
}
