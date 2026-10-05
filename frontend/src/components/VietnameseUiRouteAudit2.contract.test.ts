import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import * as ts from "typescript";
import { VI_UI_TECHNICAL_ALLOWLIST } from "@/src/lib/ui/vietnameseUiTerminology";

type Surface = {
  name: string;
  file: string;
  route?: string;
};

type CopyItem = {
  value: string;
  line: number;
};

const root = path.resolve(__dirname);

const ROUTE_SURFACES: readonly Surface[] = [
  { route: "/", name: "Tổng quan", file: "dashboard/DashboardPage.tsx" },
  { route: "/transactions", name: "Giao dịch", file: "transactions/TransactionsPage.tsx" },
  { route: "/wallets", name: "Ví", file: "wallets/WalletsPage.tsx" },
  { route: "/categories", name: "Danh mục", file: "categories/CategoriesPage.tsx" },
  { route: "/budgets", name: "Ngân sách", file: "budgets/BudgetsPage.tsx" },
  { route: "/goals", name: "Mục tiêu", file: "goals/GoalsPage.tsx" },
  { route: "/debts", name: "Khoản nợ", file: "debts/DebtsPage.tsx" },
  { route: "/savings", name: "Tiết kiệm", file: "savings/SavingsPage.tsx" },
  { route: "/investments", name: "Đầu tư", file: "investments/InvestmentsPage.tsx" },
  { route: "/reports", name: "Báo cáo", file: "reports/ReportsPage.tsx" },
  { route: "/recurring", name: "Định kỳ", file: "recurring/RecurringMoneyPage.tsx" },
  { route: "/activity", name: "Hoạt động", file: "activity/ActivityPage.tsx" },
  { route: "/ai-insights", name: "Phân tích AI", file: "ai-insights/AIInsightsPage.tsx" },
  { route: "/settings", name: "Cài đặt", file: "settings/SettingsPage.tsx" },
  { route: "/help", name: "Hướng dẫn", file: "help/HelpPage.tsx" },
  { route: "/login", name: "Đăng nhập", file: "auth/LoginPage.tsx" },
  { route: "/signup", name: "Đăng ký", file: "auth/SignupPage.tsx" },
  { route: "/forgot-password", name: "Quên mật khẩu", file: "auth/ForgotPasswordPage.tsx" },
] as const;

const GLOBAL_SURFACES: readonly Surface[] = [
  { name: "Header", file: "layout/Header.tsx" },
  { name: "Sidebar", file: "layout/Sidebar.tsx" },
  { name: "Bottom navigation", file: "layout/BottomNav.tsx" },
  { name: "Quick actions", file: "layout/QuickActionFab.tsx" },
  { name: "AI drawer", file: "ai-agent/AIAgentDrawer.tsx" },
  { name: "AI chat input", file: "ai-agent/AIChatInput.tsx" },
  { name: "AI conversation history", file: "ai-agent/AIConversationHistory.tsx" },
  { name: "AI pending actions", file: "ai-agent/AIPendingActionCard.tsx" },
  { name: "Welcome wizard", file: "onboarding/WelcomeWizard.tsx" },
  { name: "Product tour", file: "onboarding/ProductTour.tsx" },
  { name: "PWA install prompt", file: "pwa/InstallPrompt.tsx" },
] as const;

const USER_ATTRIBUTE_NAMES = new Set([
  "title",
  "placeholder",
  "aria-label",
  "alt",
]);

const USER_PROPERTY_NAMES = new Set([
  "title",
  "label",
  "subtitle",
  "desc",
  "description",
  "message",
  "confirmText",
  "cancelText",
  "note",
  "tip",
  "helperText",
  "emptyText",
]);

const SPECIAL_RETURN_FUNCTIONS = new Set(["sourceLabel", "readErrorMessage"]);

// Product-language words that must not appear in rendered Vietnamese copy.
// Technical names/acronyms are handled by VI_UI_TECHNICAL_ALLOWLIST instead.
const ENGLISH_UI_LEXEMES = new Set([
  "safe", "spend", "savings", "investment", "portfolio", "forex",
  "balance", "profit", "wallet", "center", "reconciliation", "budget",
  "intelligence", "health", "planning", "score", "executive", "summary",
  "month", "quarter", "year", "recommended", "fast", "personal", "wealth",
  "deadline", "onboarding", "wallets", "transactions", "goals", "local",
  "fallback", "planner", "debug", "attempt", "total", "execution", "pending",
  "action", "continuation", "intent", "secure", "copilot", "developer", "chat",
  "request", "failed", "stream", "tool", "keys", "none", "account", "broker",
  "crypto", "dashboard", "runway", "app", "audit", "preview", "provider",
  "model", "status", "history", "tour", "link", "agent", "cash", "flow",
  "env", "dollar", "source", "lock", "as-of", "cloud", "online", "connecting",
  "active", "database", "services", "frontend", "realtime", "backup", "restore",
  "reset", "import", "export", "file", "test", "connection", "features", "mode",
  "engine", "fabrication", "usage", "details", "short", "creative", "precise",
  "stored", "missing", "clear", "remove", "temperature", "review", "recurring",
  "snapshot", "coverage", "receipt", "forecast", "rule", "sync", "top", "dark",
  "light", "quick", "toggle", "faq", "help", "funding", "minimum", "payment",
  "freelance", "net", "worth", "roi",
]);

const ALLOWED_TOKENS = new Set(
  VI_UI_TECHNICAL_ALLOWLIST.flatMap((value) =>
    value.match(/[A-Za-z][A-Za-z-]*/g) ?? [],
  ).map((value) => value.toLowerCase()),
);

function normalized(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function addCopy(items: CopyItem[], sourceFile: ts.SourceFile, node: ts.Node, value: string) {
  const text = normalized(value);
  if (!text) return;
  const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
  items.push({ value: text, line });
}

function propertyNameText(name: ts.PropertyName, sourceFile: ts.SourceFile) {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }
  return name.getText(sourceFile);
}

function functionNameFor(node: ts.Node): string | null {
  let current: ts.Node | undefined = node.parent;
  while (current) {
    if (ts.isFunctionDeclaration(current) && current.name) return current.name.text;
    if (ts.isMethodDeclaration(current) && current.name) return current.name.getText();
    if (ts.isArrowFunction(current) || ts.isFunctionExpression(current)) {
      const parent = current.parent;
      if (ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) return parent.name.text;
    }
    current = current.parent;
  }
  return null;
}

function extractRenderedCopy(source: string, fileName: string): CopyItem[] {
  const sourceFile = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const items: CopyItem[] = [];

  let visit: (node: ts.Node) => void;

  const collectValue = (node: ts.Node | undefined): void => {
    if (!node) return;
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      addCopy(items, sourceFile, node, node.text);
      return;
    }
    if (ts.isTemplateExpression(node)) {
      addCopy(items, sourceFile, node, node.head.text);
      for (const span of node.templateSpans) addCopy(items, sourceFile, span.literal, span.literal.text);
      return;
    }
    if (ts.isConditionalExpression(node)) {
      collectValue(node.whenTrue);
      collectValue(node.whenFalse);
      return;
    }
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
      collectValue(node.left);
      collectValue(node.right);
      return;
    }
    if (ts.isParenthesizedExpression(node)) {
      collectValue(node.expression);
      return;
    }
  };

  const visitNestedJsx = (node: ts.Node | undefined): void => {
    if (!node) return;
    if (ts.isJsxElement(node) || ts.isJsxFragment(node) || ts.isJsxSelfClosingElement(node)) {
      visit(node);
      return;
    }
    ts.forEachChild(node, visitNestedJsx);
  };

  visit = (node: ts.Node): void => {
    if (ts.isJsxText(node)) {
      addCopy(items, sourceFile, node, node.getText(sourceFile));
      return;
    }

    if (ts.isJsxAttribute(node)) {
      const name = node.name.getText(sourceFile);
      if (USER_ATTRIBUTE_NAMES.has(name)) {
        if (node.initializer && ts.isStringLiteral(node.initializer)) {
          addCopy(items, sourceFile, node.initializer, node.initializer.text);
        } else if (node.initializer && ts.isJsxExpression(node.initializer)) {
          collectValue(node.initializer.expression);
        }
      }
      return;
    }

    if (ts.isJsxExpression(node)) {
      collectValue(node.expression);
      visitNestedJsx(node.expression);
      return;
    }

    if (ts.isPropertyAssignment(node)) {
      const name = propertyNameText(node.name, sourceFile);
      if (USER_PROPERTY_NAMES.has(name)) {
        collectValue(node.initializer);
        return;
      }
    }

    if (ts.isReturnStatement(node)) {
      const fnName = functionNameFor(node);
      if (fnName && (SPECIAL_RETURN_FUNCTIONS.has(fnName) || /(Label|Title|Message|Description|Text)$/i.test(fnName))) {
        collectValue(node.expression);
        return;
      }
    }

    if (ts.isNewExpression(node) && node.expression.getText(sourceFile) === "Error") {
      for (const argument of node.arguments ?? []) collectValue(argument);
      return;
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return items;
}

function blockedTokens(value: string) {
  const words = (value.match(/[A-Za-z][A-Za-z-]*/g) ?? []).map((word) => word.toLowerCase());
  return [...new Set(words.filter((word) => ENGLISH_UI_LEXEMES.has(word) && !ALLOWED_TOKENS.has(word)))];
}

function auditSurface(surface: Surface) {
  const fullPath = path.resolve(root, surface.file);
  const source = readFileSync(fullPath, "utf8");
  const copy = extractRenderedCopy(source, surface.file);
  return copy.flatMap((item) => {
    const blocked = blockedTokens(item.value);
    return blocked.length
      ? [`${surface.route ?? "global"} | ${surface.file}:${item.line} | [${blocked.join(", ")}] ${item.value}`]
      : [];
  });
}

describe("MYFINANCE-VIETNAMESE-UI-ROUTE-AUDIT-2", () => {
  it("covers all 18 routes plus global UI surfaces", () => {
    expect(ROUTE_SURFACES).toHaveLength(18);
    expect(GLOBAL_SURFACES).toHaveLength(11);
    for (const surface of [...ROUTE_SURFACES, ...GLOBAL_SURFACES]) {
      expect(existsSync(path.resolve(root, surface.file)), `Missing audit surface: ${surface.file}`).toBe(true);
    }
  });

  it("rejects mixed English product copy in rendered/static UI contexts", () => {
    const violations = [...ROUTE_SURFACES, ...GLOBAL_SURFACES].flatMap(auditSurface);
    expect(
      violations,
      `Vietnamese route audit found ${violations.length} mixed-copy violation(s):\n${violations.slice(0, 80).join("\n")}`,
    ).toEqual([]);
  });

  it("keeps a narrow technical allowlist for names and finance/engineering acronyms", () => {
    for (const token of ["MyFinance", "AI", "API", "CSV", "JSON", "SQL", "OpenAI", "Supabase", "ETF", "FIRE", "2FA", "GMT", "UTC", "BYOK", "MoM", "QoQ", "YoY", "GPT"]) {
      expect(VI_UI_TECHNICAL_ALLOWLIST).toContain(token);
    }
  });
});
