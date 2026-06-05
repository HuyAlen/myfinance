"use client";

import { useEffect, useState } from "react";
import {
  Database,
  Download,
  FileJson,
  RefreshCcw,
  Settings,
  Trash2,
  Upload,
} from "lucide-react";

import {
  clearAllData,
  getCategories,
  getDebts,
  getGoals,
  getBudgets,
  getInvestments,
  getTransactions,
  getWallets,
  importAllData,
  initFinanceDemoData,
  resetFinanceDemoData,
} from "@/src/services/finance/financeStorage";

export default function SettingsPage() {
  const [stats, setStats] = useState({
    wallets: 0,
    categories: 0,
    transactions: 0,
    debts: 0,
    goals: 0,
  });

  async function reloadStats() {
    const [wallets, categories, transactions, debts, goals] = await Promise.all(
      [
        getWallets(),
        getCategories(),
        getTransactions(),
        getDebts(),
        getGoals(),
      ],
    );
    setStats({
      wallets: wallets.length,
      categories: categories.length,
      transactions: transactions.length,
      debts: debts.length,
      goals: goals.length,
    });
  }

  useEffect(() => {
    initFinanceDemoData().then(reloadStats);
  }, []);

  async function handleResetDemo() {
    const ok = confirm("Bạn có chắc muốn reset về dữ liệu demo?");

    if (!ok) return;

    await resetFinanceDemoData();
    await reloadStats();
    alert("Đã reset dữ liệu demo.");
  }

  async function handleClearAll() {
    const ok = confirm("Bạn có chắc muốn xóa toàn bộ dữ liệu của app?");

    if (!ok) return;

    await clearAllData();
    await reloadStats();
    alert("Đã xóa toàn bộ dữ liệu.");
  }

  async function handleExportJson() {
    const [
      wallets,
      categories,
      transactions,
      debts,
      goals,
      budgets,
      investments,
    ] = await Promise.all([
      getWallets(),
      getCategories(),
      getTransactions(),
      getDebts(),
      getGoals(),
      getBudgets(),
      getInvestments(),
    ]);

    const data = {
      pf_wallets: wallets,
      pf_categories: categories,
      pf_transactions: transactions,
      pf_debts: debts,
      pf_goals: goals,
      pf_budgets: budgets,
      pf_investments: investments,
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = `personal-finance-backup-${new Date()
      .toISOString()
      .slice(0, 10)}.json`;

    link.click();

    URL.revokeObjectURL(url);
  }

  function handleImportJson(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) return;

    const reader = new FileReader();

    reader.onload = async () => {
      try {
        const result = JSON.parse(String(reader.result));

        await importAllData({
          wallets: Array.isArray(result.pf_wallets)
            ? result.pf_wallets
            : undefined,
          categories: Array.isArray(result.pf_categories)
            ? result.pf_categories
            : undefined,
          transactions: Array.isArray(result.pf_transactions)
            ? result.pf_transactions
            : undefined,
          debts: Array.isArray(result.pf_debts) ? result.pf_debts : undefined,
          goals: Array.isArray(result.pf_goals) ? result.pf_goals : undefined,
          budgets: Array.isArray(result.pf_budgets)
            ? result.pf_budgets
            : undefined,
          investments: Array.isArray(result.pf_investments)
            ? result.pf_investments
            : undefined,
        });

        await reloadStats();
        alert("Import dữ liệu thành công.");
      } catch {
        alert("File JSON không hợp lệ.");
      }
    };

    reader.readAsText(file);
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[2rem] border border-slate-200 bg-gradient-to-br from-blue-50 via-white to-cyan-50 p-6 shadow-sm">
        <div>
          <p className="text-sm font-bold text-blue-600">Cài đặt</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">
            Cài đặt ứng dụng
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            Quản lý dữ liệu, backup, restore và thông tin ứng dụng.
          </p>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-5">
        <StatCard label="Ví tiền" value={stats.wallets} />
        <StatCard label="Danh mục" value={stats.categories} />
        <StatCard label="Giao dịch" value={stats.transactions} />
        <StatCard label="Khoản nợ" value={stats.debts} />
        <StatCard label="Mục tiêu" value={stats.goals} />
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <Panel
          icon={<Database size={22} />}
          title="Dữ liệu"
          subtitle="Tất cả dữ liệu được lưu trên Supabase."
        >
          <div className="mt-6 space-y-4">
            <SettingRow label="Loại lưu trữ" value="Supabase" />
            <SettingRow label="Tiền tệ" value="VND" />
            <SettingRow label="Chế độ đồng bộ" value="Cloud Sync" />
            <SettingRow label="Backend" value="Supabase" />
          </div>
        </Panel>

        <Panel
          icon={<Settings size={22} />}
          title="Thông tin ứng dụng"
          subtitle="Phiên bản hiện tại của Personal Finance."
        >
          <div className="mt-6 space-y-4">
            <SettingRow label="Tên app" value="MyFinance" />
            <SettingRow label="Frontend" value="Next.js + TypeScript" />
            <SettingRow label="UI" value="TailwindCSS" />
            <SettingRow label="Dữ liệu" value="Supabase" />
          </div>
        </Panel>
      </section>

      <section className="grid gap-6 xl:grid-cols-3">
        <ActionCard
          icon={<RefreshCcw size={22} />}
          title="Reset dữ liệu demo"
          text="Đưa dữ liệu ví, giao dịch, danh mục, ngân sách, mục tiêu về mặc định."
          buttonText="Reset demo"
          onClick={handleResetDemo}
        />

        <ActionCard
          icon={<Download size={22} />}
          title="Export JSON"
          text="Tải toàn bộ dữ liệu localStorage về máy dưới dạng file JSON."
          buttonText="Tải backup"
          onClick={handleExportJson}
        />

        <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-400 text-white shadow-lg">
            <Upload size={22} />
          </div>

          <h3 className="mt-5 text-lg font-black text-slate-900">
            Import JSON
          </h3>

          <p className="mt-2 text-sm leading-6 text-slate-500">
            Khôi phục dữ liệu từ file backup JSON đã export trước đó.
          </p>

          <label className="mt-5 inline-flex cursor-pointer items-center justify-center rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-400 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-emerald-100">
            Chọn file JSON
            <input
              type="file"
              accept="application/json"
              onChange={handleImportJson}
              className="hidden"
            />
          </label>
        </div>
      </section>

      <section className="rounded-[2rem] border border-rose-100 bg-rose-50 p-6 shadow-sm">
        <div className="flex flex-col justify-between gap-5 md:flex-row md:items-center">
          <div>
            <div className="flex items-center gap-3">
              <div className="flex size-12 items-center justify-center rounded-2xl bg-rose-500 text-white shadow-lg shadow-rose-100">
                <Trash2 size={22} />
              </div>

              <div>
                <h3 className="text-lg font-black text-rose-700">
                  Xóa toàn bộ dữ liệu
                </h3>
                <p className="mt-1 text-sm text-rose-600">
                  Thao tác này sẽ xóa dữ liệu app trên trình duyệt hiện tại.
                </p>
              </div>
            </div>
          </div>

          <button
            onClick={handleClearAll}
            className="rounded-2xl bg-rose-500 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-rose-100"
          >
            Xóa tất cả
          </button>
        </div>
      </section>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[1.7rem] border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-sm font-bold text-slate-500">{label}</p>
      <p className="mt-3 text-3xl font-black text-blue-600">{value}</p>
    </div>
  );
}

function Panel({
  icon,
  title,
  subtitle,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-cyan-500 text-white shadow-lg shadow-blue-100">
          {icon}
        </div>

        <div>
          <h3 className="text-lg font-black text-slate-900">{title}</h3>
          <p className="text-sm text-slate-500">{subtitle}</p>
        </div>
      </div>

      {children}
    </div>
  );
}

function SettingRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3">
      <span className="text-sm text-slate-500">{label}</span>
      <span className="font-black text-slate-900">{value}</span>
    </div>
  );
}

function ActionCard({
  icon,
  title,
  text,
  buttonText,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
  buttonText: string;
  onClick: () => void;
}) {
  return (
    <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-cyan-500 text-white shadow-lg shadow-blue-100">
        {icon}
      </div>

      <h3 className="mt-5 text-lg font-black text-slate-900">{title}</h3>

      <p className="mt-2 text-sm leading-6 text-slate-500">{text}</p>

      <button
        onClick={onClick}
        className="mt-5 rounded-2xl bg-gradient-to-r from-blue-600 to-cyan-500 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-blue-100"
      >
        {buttonText}
      </button>
    </div>
  );
}
