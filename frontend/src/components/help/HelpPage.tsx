"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  Bot,
  BriefcaseBusiness,
  ChartPie,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Circle,
  Folder,
  Home,
  Landmark,
  Lightbulb,
  ReceiptText,
  Search,
  Settings,
  Sparkles,
  Star,
  Target,
  Wallet,
  X,
  Zap,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
type IconComponent = React.ComponentType<{ size?: number; strokeWidth?: number }>;

type Guide = {
  id: string;
  title: string;
  icon: IconComponent;
  href: string;
  accentBg: string;
  accentLight: string;
  accentText: string;
  accentBorder: string;
  accentIcon: string;
  purpose: string;
  when: string;
  howTo: string[];
  example: string;
  tips: string[];
};

type FaqItem = {
  id: string;
  q: string;
  a: string;
  formula?: string;
};

type ChecklistItem = {
  id: string;
  label: string;
  href: string;
  desc: string;
};

type QuickFlowStep = {
  num: number;
  title: string;
  desc: string;
  href: string;
  numBg: string;
  numText: string;
};

type OnboardStep = {
  step: number;
  title: string;
  desc: string;
  icon: IconComponent;
  href: string;
  cta: string;
  bg: string;
  light: string;
  text: string;
  border: string;
  shadow: string;
};

// ─── Data: Onboarding Steps ──────────────────────────────────────────────────
const ONBOARDING_STEPS: OnboardStep[] = [
  {
    step: 1,
    title: "Bắt đầu trong 5 phút",
    desc: "Thiết lập tài khoản và ghi lại giao dịch đầu tiên chỉ trong 5 phút.",
    icon: Zap,
    href: "/wallets",
    cta: "Bắt đầu ngay",
    bg: "bg-blue-600",
    light: "bg-blue-50",
    text: "text-blue-700",
    border: "border-blue-200",
    shadow: "shadow-blue-200/60",
  },
  {
    step: 2,
    title: "Thiết lập tài khoản",
    desc: "Tạo các ví tiền (ngân hàng, tiền mặt, ví điện tử) để theo dõi số dư.",
    icon: Wallet,
    href: "/wallets",
    cta: "Tạo ví tiền",
    bg: "bg-emerald-600",
    light: "bg-emerald-50",
    text: "text-emerald-700",
    border: "border-emerald-200",
    shadow: "shadow-emerald-200/60",
  },
  {
    step: 3,
    title: "Nhập giao dịch đầu tiên",
    desc: "Ghi lại khoản thu hoặc chi đầu tiên để bắt đầu theo dõi dòng tiền.",
    icon: ReceiptText,
    href: "/transactions",
    cta: "Thêm giao dịch",
    bg: "bg-cyan-600",
    light: "bg-cyan-50",
    text: "text-cyan-700",
    border: "border-cyan-200",
    shadow: "shadow-cyan-200/60",
  },
  {
    step: 4,
    title: "Tạo ngân sách đầu tiên",
    desc: "Đặt giới hạn chi tiêu theo danh mục để kiểm soát tài chính hiệu quả.",
    icon: ChartPie,
    href: "/budgets",
    cta: "Tạo ngân sách",
    bg: "bg-indigo-600",
    light: "bg-indigo-50",
    text: "text-indigo-700",
    border: "border-indigo-200",
    shadow: "shadow-indigo-200/60",
  },
  {
    step: 5,
    title: "Tạo mục tiêu đầu tiên",
    desc: "Thiết lập mục tiêu tiết kiệm có kỳ hạn để đạt được ước mơ tài chính.",
    icon: Target,
    href: "/goals",
    cta: "Đặt mục tiêu",
    bg: "bg-violet-600",
    light: "bg-violet-50",
    text: "text-violet-700",
    border: "border-violet-200",
    shadow: "shadow-violet-200/60",
  },
];

// ─── Data: Checklist ─────────────────────────────────────────────────────────
const CHECKLIST_ITEMS: ChecklistItem[] = [
  { id: "profile",     label: "Hoàn thành hồ sơ",          href: "/settings",     desc: "Cập nhật tên và thông tin cá nhân" },
  { id: "wallet",      label: "Tạo ví đầu tiên",            href: "/wallets",      desc: "Thêm ít nhất một ví tiền" },
  { id: "transaction", label: "Thêm giao dịch đầu tiên",    href: "/transactions", desc: "Ghi lại khoản thu hoặc chi đầu tiên" },
  { id: "budget",      label: "Tạo ngân sách",              href: "/budgets",      desc: "Đặt ngân sách cho ít nhất một danh mục" },
  { id: "goal",        label: "Tạo mục tiêu",               href: "/goals",        desc: "Thiết lập mục tiêu tài chính đầu tiên" },
  { id: "data",        label: "Kết nối dữ liệu",            href: "/settings",     desc: "Xem trạng thái đồng bộ Supabase" },
  { id: "report",      label: "Xem báo cáo",                href: "/reports",      desc: "Khám phá phân tích tài chính" },
];

// ─── Data: Quick Flow ────────────────────────────────────────────────────────
const QUICK_FLOW: QuickFlowStep[] = [
  { num: 1, title: "Tạo ví",           desc: "Thêm tài khoản ngân hàng, tiền mặt",   href: "/wallets",      numBg: "bg-blue-600",   numText: "text-white" },
  { num: 2, title: "Thêm giao dịch",   desc: "Ghi chép thu chi hàng ngày",           href: "/transactions", numBg: "bg-emerald-600",numText: "text-white" },
  { num: 3, title: "Tạo ngân sách",    desc: "Kiểm soát chi tiêu theo tháng",        href: "/budgets",      numBg: "bg-cyan-600",   numText: "text-white" },
  { num: 4, title: "Tạo mục tiêu",     desc: "Đặt mục tiêu tiết kiệm cụ thể",       href: "/goals",        numBg: "bg-indigo-600", numText: "text-white" },
  { num: 5, title: "Theo dõi Dashboard",desc: "Xem tổng quan tài chính mỗi ngày",   href: "/",             numBg: "bg-violet-600", numText: "text-white" },
  { num: 6, title: "Xem AI Insights",  desc: "Nhận tư vấn thông minh từ AI",         href: "/ai-insights",  numBg: "bg-rose-500",   numText: "text-white" },
];

// ─── Data: Feature Guides ────────────────────────────────────────────────────
const FEATURE_GUIDES: Guide[] = [
  {
    id: "dashboard",
    title: "Dashboard · Tổng quan",
    icon: Home,
    href: "/",
    accentBg: "bg-blue-600",
    accentLight: "bg-blue-50",
    accentText: "text-blue-700",
    accentBorder: "border-blue-200",
    accentIcon: "bg-blue-100 text-blue-600",
    purpose: "Xem toàn bộ tình hình tài chính trong một màn hình: Financial Health Score, Net Worth, dòng tiền, ngân sách và mục tiêu. Trung tâm điều hành tài chính cá nhân.",
    when: "Mở đầu mỗi ngày để nắm bắt tình hình. Xem bất cứ khi nào cần đánh giá nhanh sức khoẻ tài chính tổng thể.",
    howTo: [
      "Mở MyFinance → Dashboard hiển thị ngay trang chủ",
      "Xem Financial Health Score (0–100 điểm) ở phần đầu",
      "Kiểm tra Net Worth = Tổng tài sản − Tổng nợ",
      "Xem biểu đồ dòng tiền 12 tháng gần nhất",
      "Đọc AI Smart Insights ở cuối trang để nhận gợi ý",
    ],
    example: "Sáng thứ Hai: Health Score 72/100. Net Worth tháng này tăng 2.3M so với tháng trước. Chi tiêu tuần này đang ở 65% ngân sách — vẫn ổn.",
    tips: [
      "Kiểm tra Dashboard mỗi sáng chỉ 1 phút để giữ nhịp",
      "Health Score giảm liên tục → cần xem lại chi tiêu",
      "Net Worth tăng đều đặn = bạn đang đi đúng hướng",
    ],
  },
  {
    id: "transactions",
    title: "Giao Dịch · Thu & Chi",
    icon: ReceiptText,
    href: "/transactions",
    accentBg: "bg-emerald-600",
    accentLight: "bg-emerald-50",
    accentText: "text-emerald-700",
    accentBorder: "border-emerald-200",
    accentIcon: "bg-emerald-100 text-emerald-600",
    purpose: "Ghi chép mọi khoản thu nhập, chi tiêu và chuyển tiền giữa các ví. Trung tâm dữ liệu của toàn bộ ứng dụng — tất cả phân tích đều dựa trên đây.",
    when: "Sau mỗi lần mua hàng, nhận lương hoặc chuyển tiền. Càng ghi sớm sau giao dịch càng chính xác.",
    howTo: [
      "Nhấn nút 'Thêm giao dịch' ở góc trên phải",
      "Chọn loại: Thu nhập / Chi tiêu / Chuyển tiền",
      "Nhập số tiền và chọn danh mục phù hợp",
      "Chọn ví tiền và thêm ghi chú mô tả",
      "Nhấn Lưu → số dư ví tự động cập nhật ngay lập tức",
    ],
    example: "6/6 sáng: Chi 45,000đ ăn sáng → Danh mục 'Ăn uống' → Ví 'Tiền mặt'. Số dư tự trừ 45K. Tháng 6 đã chi 1.2M/3M ngân sách ăn uống.",
    tips: [
      "Ghi ngay sau giao dịch để không quên",
      "Dùng 'Chuyển tiền' khi chuyển giữa các ví (không phải Chi)",
      "Bật Định kỳ cho các khoản cố định hàng tháng (thuê nhà, học phí)",
      "Dùng tính năng Lọc và xuất CSV để phân tích sâu hơn",
    ],
  },
  {
    id: "wallets",
    title: "Ví Tiền · Tài khoản",
    icon: Wallet,
    href: "/wallets",
    accentBg: "bg-cyan-600",
    accentLight: "bg-cyan-50",
    accentText: "text-cyan-700",
    accentBorder: "border-cyan-200",
    accentIcon: "bg-cyan-100 text-cyan-600",
    purpose: "Quản lý tất cả tài khoản tài chính: tiền mặt, ngân hàng, ví điện tử, tài khoản đầu tư. Số dư tự động cập nhật theo giao dịch.",
    when: "Khi mở tài khoản mới. Khi cần cập nhật số dư thực tế. Khi muốn theo dõi tổng tài sản đang có.",
    howTo: [
      "Vào 'Ví Tiền' → nhấn 'Thêm ví tiền'",
      "Chọn loại ví: Tiền mặt / Ngân hàng / Ví điện tử / Đầu tư",
      "Nhập tên ví và số dư hiện tại (chính xác nhất có thể)",
      "Lưu → ví xuất hiện trong danh sách và tổng tài sản",
      "Tất cả giao dịch sau đó sẽ tự cập nhật số dư ví",
    ],
    example: "Tạo 3 ví: 'MB Bank' (48M), 'Tiền mặt' (1.5M), 'MoMo' (300K). Tổng tài sản hiển thị: 49.8M. Dashboard cập nhật ngay.",
    tips: [
      "Tạo ví riêng cho từng tài khoản ngân hàng thực tế",
      "Dùng 'Chuyển tiền' (không phải Chi) để chuyển giữa ví",
      "Cập nhật số dư thực tế định kỳ để khớp với ngân hàng",
      "Tạo ví 'Quỹ khẩn cấp' riêng để không đụng vào",
    ],
  },
  {
    id: "categories",
    title: "Danh Mục · Phân loại",
    icon: Folder,
    href: "/categories",
    accentBg: "bg-indigo-600",
    accentLight: "bg-indigo-50",
    accentText: "text-indigo-700",
    accentBorder: "border-indigo-200",
    accentIcon: "bg-indigo-100 text-indigo-600",
    purpose: "Phân loại thu nhập và chi tiêu thành các nhóm rõ ràng. Là nền tảng để phân tích xu hướng, ngân sách và báo cáo.",
    when: "Khi thiết lập lần đầu để tạo bộ danh mục cơ bản. Khi xuất hiện nhu cầu chi tiêu mới chưa có danh mục phù hợp.",
    howTo: [
      "Vào 'Danh Mục' → xem danh sách có sẵn",
      "Nhấn 'Thêm danh mục' để tạo loại mới",
      "Đặt tên rõ ràng và chọn loại: Thu nhập hoặc Chi tiêu",
      "Lưu → danh mục xuất hiện khi tạo giao dịch",
      "Xem thống kê chi tiêu theo danh mục trong Báo cáo",
    ],
    example: "Danh mục Chi: Ăn uống, Đi lại, Giải trí, Nhà ở, Y tế, Mua sắm. Danh mục Thu: Lương, Freelance, Đầu tư, Thưởng.",
    tips: [
      "Giữ 8–15 danh mục để dễ quản lý và phân tích",
      "Đặt tên đơn nghĩa, không chồng chéo",
      "Hạn chế dùng danh mục 'Khác' — quá chung chung",
      "Review và dọn dẹp danh mục không dùng mỗi quý",
    ],
  },
  {
    id: "budgets",
    title: "Ngân Sách · Kế hoạch chi",
    icon: ChartPie,
    href: "/budgets",
    accentBg: "bg-violet-600",
    accentLight: "bg-violet-50",
    accentText: "text-violet-700",
    accentBorder: "border-violet-200",
    accentIcon: "bg-violet-100 text-violet-600",
    purpose: "Đặt giới hạn chi tiêu theo danh mục mỗi tháng. Nhận cảnh báo tự động khi gần hoặc vượt hạn mức.",
    when: "Đầu mỗi tháng để lập kế hoạch chi tiêu. Khi muốn kiểm soát một khoản chi cụ thể đang bị lạm phát.",
    howTo: [
      "Vào 'Ngân Sách' → nhấn 'Thêm ngân sách'",
      "Chọn danh mục và tháng áp dụng",
      "Nhập hạn mức (ví dụ: 3,000,000đ/tháng cho Ăn uống)",
      "App tự tính % đã chi so với hạn mức theo thời gian thực",
      "Nhận cảnh báo khi đạt 80% và 100% hạn mức",
    ],
    example: "Tháng 6: Ngân sách Ăn uống 3M. Đến ngày 15 đã chi 1.8M (60%) → đang ổn. Dự báo: cuối tháng ~3.4M → cần cắt giảm 400K.",
    tips: [
      "Đặt ngân sách dựa trên chi tiêu thực tế tháng trước",
      "Bắt đầu với 3–5 danh mục chi lớn nhất của bạn",
      "Quy tắc 50/30/20: 50% nhu cầu, 30% muốn, 20% tiết kiệm",
      "Budget Intelligence phân tích xu hướng và cảnh báo tự động",
    ],
  },
  {
    id: "goals",
    title: "Mục Tiêu · Tiết kiệm",
    icon: Target,
    href: "/goals",
    accentBg: "bg-rose-600",
    accentLight: "bg-rose-50",
    accentText: "text-rose-700",
    accentBorder: "border-rose-200",
    accentIcon: "bg-rose-100 text-rose-600",
    purpose: "Thiết lập và theo dõi mục tiêu tiết kiệm có kỳ hạn. Tự động tính tốc độ tiết kiệm cần thiết và dự báo ngày đạt mục tiêu.",
    when: "Khi có kế hoạch mua sắm lớn, du lịch, mua nhà/xe. Hoặc xây dựng quỹ dự phòng khẩn cấp.",
    howTo: [
      "Vào 'Mục Tiêu' → nhấn 'Thêm mục tiêu'",
      "Đặt tên, số tiền mục tiêu và deadline kỳ vọng",
      "Nhập số tiền hiện đã tích luỹ",
      "App tính số tiền cần tiết kiệm mỗi tháng để đạt mục tiêu",
      "Cập nhật 'Đã tích luỹ' định kỳ để theo dõi tiến độ",
    ],
    example: "Mục tiêu 'Mua xe': 300M. Đã có: 50M. Deadline: 24 tháng. → App tính: cần tiết kiệm 10.4M/tháng. AI dự báo: đạt mục tiêu tháng 6/2028.",
    tips: [
      "Mục tiêu đầu tiên nên là Quỹ khẩn cấp 3–6 tháng chi tiêu",
      "Tự động chuyển tiền tiết kiệm vào đầu tháng",
      "Chia mục tiêu lớn thành các milestone nhỏ hơn",
      "AI Goal Coach gợi ý tốc độ tiết kiệm và cách đạt nhanh hơn",
    ],
  },
  {
    id: "debts",
    title: "Nợ & Khoản Vay",
    icon: Landmark,
    href: "/debts",
    accentBg: "bg-amber-600",
    accentLight: "bg-amber-50",
    accentText: "text-amber-700",
    accentBorder: "border-amber-200",
    accentIcon: "bg-amber-100 text-amber-700",
    purpose: "Theo dõi tất cả khoản nợ (ngân hàng, bạn bè, thẻ tín dụng) và lập kế hoạch trả nợ tối ưu để tiết kiệm lãi.",
    when: "Khi vay tiền bất kỳ ai. Khi trả một phần nợ. Khi muốn tối ưu thứ tự trả nợ để giảm thiểu lãi suất.",
    howTo: [
      "Vào 'Nợ & Khoản Vay' → nhấn 'Thêm khoản nợ'",
      "Nhập tên, tổng số nợ ban đầu và số còn lại hiện tại",
      "Thêm lãi suất và kỳ hạn (nếu là nợ ngân hàng)",
      "Cập nhật số còn lại sau mỗi lần thanh toán",
      "Xem AI Debt Coach để tối ưu thứ tự trả nợ",
    ],
    example: "Vay MB Bank: 100M gốc, lãi 8%/năm, còn 72M. Vay bạn: 5M, 0% lãi, còn 5M → AI khuyến nghị: trả ngân hàng trước, tiết kiệm 1.2M lãi.",
    tips: [
      "Chiến lược Avalanche: trả nợ lãi suất cao trước — tiết kiệm nhất",
      "Chiến lược Snowball: trả nợ nhỏ nhất trước — tạo động lực",
      "Mục tiêu: Debt Ratio < 40% thu nhập hàng tháng",
      "Không vay mới khi tổng nợ > 50% thu nhập năm",
    ],
  },
  {
    id: "investments",
    title: "Đầu Tư · Danh mục",
    icon: BriefcaseBusiness,
    href: "/investments",
    accentBg: "bg-teal-600",
    accentLight: "bg-teal-50",
    accentText: "text-teal-700",
    accentBorder: "border-teal-200",
    accentIcon: "bg-teal-100 text-teal-600",
    purpose: "Theo dõi danh mục đầu tư đa dạng (cổ phiếu, crypto, quỹ ETF, vàng) và tự động tính ROI, P&L.",
    when: "Khi mua hoặc bán tài sản đầu tư. Khi muốn đánh giá hiệu suất danh mục. Định kỳ hàng tuần để cập nhật giá.",
    howTo: [
      "Vào 'Đầu Tư' → nhấn 'Thêm khoản đầu tư'",
      "Chọn loại: Cổ phiếu / Crypto / Quỹ ETF / Vàng / Khác",
      "Nhập tên, mã (nếu có), vốn đầu tư và giá trị hiện tại",
      "App tính P&L (Lãi/Lỗ) và ROI% tự động",
      "Portfolio Health Score đánh giá sức khoẻ tổng thể danh mục",
    ],
    example: "VNM: vốn 20M → giá trị 24.8M → P&L +4.8M (ROI +24%). BTC: vốn 15M → giá trị 11M → P&L -4M (ROI -27%). Portfolio tổng: +800K.",
    tips: [
      "Đa dạng hóa: không để quá 50% vào một loại tài sản",
      "Cập nhật giá hiện tại mỗi tuần để ROI chính xác",
      "ROI âm liên tục 6 tháng → cân nhắc tái cơ cấu danh mục",
      "Điểm Portfolio Health < 60 → cần tăng đa dạng hóa",
    ],
  },
  {
    id: "reports",
    title: "Báo Cáo · Phân tích",
    icon: BarChart3,
    href: "/reports",
    accentBg: "bg-purple-600",
    accentLight: "bg-purple-50",
    accentText: "text-purple-700",
    accentBorder: "border-purple-200",
    accentIcon: "bg-purple-100 text-purple-600",
    purpose: "Phân tích xu hướng tài chính, so sánh theo tháng/năm và dự báo tình hình tài chính 6 tháng tới.",
    when: "Cuối tháng để đánh giá hiệu quả. Đầu năm để lập kế hoạch. Khi cần hiểu rõ chi tiêu ở đâu nhiều nhất.",
    howTo: [
      "Vào 'Báo cáo' → xem tổng quan tài chính tháng hiện tại",
      "Chọn khoảng thời gian để phân tích kỳ cụ thể",
      "Xem biểu đồ Donut phân bổ chi tiêu theo danh mục",
      "Phân tích xu hướng thu chi 12 tháng bằng biểu đồ đường",
      "Đọc phần Dự báo và AI Summary ở cuối trang",
    ],
    example: "Tháng 5: Thu 30M, Chi 22M, Tiết kiệm 8M (26.7%). Ăn uống chiếm 23.6% tổng chi (5.2M). Xu hướng: chi tiêu tháng này giảm 8% so với tháng 4.",
    tips: [
      "So sánh tháng này vs tháng trước để thấy xu hướng rõ ràng",
      "Tỷ lệ tiết kiệm mục tiêu: ≥ 20% thu nhập hàng tháng",
      "Export CSV cuối năm để lưu trữ hồ sơ tài chính",
      "Dự báo AI dựa trên pattern 6 tháng gần nhất",
    ],
  },
  {
    id: "ai-insights",
    title: "AI Advisor · Tư vấn",
    icon: Bot,
    href: "/ai-insights",
    accentBg: "bg-fuchsia-600",
    accentLight: "bg-fuchsia-50",
    accentText: "text-fuchsia-700",
    accentBorder: "border-fuchsia-200",
    accentIcon: "bg-fuchsia-100 text-fuchsia-600",
    purpose: "Nhận tư vấn tài chính cá nhân hoá từ AI dựa trên dữ liệu thực tế của bạn. Không phán xét — chỉ gợi ý cụ thể.",
    when: "Hàng tuần để review tình hình. Khi cần gợi ý cải thiện cụ thể. Khi muốn hiểu điểm yếu tài chính cần khắc phục.",
    howTo: [
      "Vào 'AI Advisor' → xem Health Score và Risk Score",
      "Đọc từng AI Insight card (mỗi card là một phân tích riêng)",
      "Xem Financial Forecast — dự báo 6 tháng tới",
      "Kiểm tra Spending Anomalies — các bất thường chi tiêu",
      "Thực hiện các gợi ý hành động để cải thiện điểm số",
    ],
    example: "AI phát hiện: 'Chi Giải trí tháng 5 cao hơn trung bình 3 tháng 45%. Dự báo vượt ngân sách 800K.' → Áp dụng: giảm 2 buổi ăn ngoài/tuần.",
    tips: [
      "Kiểm tra AI Insights ít nhất 1 lần mỗi tuần",
      "Health Score ≥ 80 = tài chính lành mạnh và bền vững",
      "Thực hiện ít nhất 1 gợi ý AI mỗi tháng để cải thiện",
      "Dữ liệu càng nhiều và đầy đủ → AI phân tích càng chính xác",
    ],
  },
  {
    id: "settings",
    title: "Cài Đặt · Tuỳ chỉnh",
    icon: Settings,
    href: "/settings",
    accentBg: "bg-slate-700",
    accentLight: "bg-slate-50",
    accentText: "text-slate-700",
    accentBorder: "border-slate-200",
    accentIcon: "bg-slate-100 text-slate-600",
    purpose: "Tuỳ chỉnh ứng dụng: thông tin cá nhân, ngôn ngữ, thông báo tự động và quản lý dữ liệu (xuất/nhập/reset).",
    when: "Lần đầu sử dụng để cấu hình đúng. Khi cần thay đổi thông báo. Khi muốn xuất/nhập/backup dữ liệu.",
    howTo: [
      "Vào 'Cài Đặt' → chọn mục cần thay đổi từ menu trái",
      "Cập nhật Hồ sơ: tên, email, múi giờ, đơn vị tiền tệ",
      "Tuỳ chỉnh Preferences: ngôn ngữ, định dạng ngày tháng",
      "Bật thông báo Budget Alert và Goal Alert",
      "Xuất dữ liệu CSV hoặc nhập từ file JSON backup",
    ],
    example: "Cấu hình ban đầu: bật Budget Alert (80%), tắt Weekly Summary. Đặt đơn vị VND. Xuất dữ liệu cuối quý để backup.",
    tips: [
      "Bật Budget Alert (80%) để nhận cảnh báo trước khi vượt",
      "Xuất dữ liệu định kỳ mỗi tháng để backup an toàn",
      "Thiết lập 'Tháng tài chính' bắt đầu từ ngày nhận lương",
      "Kết nối Supabase để đồng bộ dữ liệu đa thiết bị",
    ],
  },
];

// ─── Data: FAQ ────────────────────────────────────────────────────────────────
const FAQ_ITEMS: FaqItem[] = [
  {
    id: "net-worth",
    q: "Tài sản ròng (Net Worth) là gì?",
    a: "Tài sản ròng là thước đo tài chính quan trọng nhất, phản ánh sức khoẻ tài chính thực sự của bạn. Net Worth dương và tăng theo thời gian = đang đi đúng hướng tới tự do tài chính.",
    formula: "Net Worth = Tổng ví tiền + Đầu tư − Tổng nợ",
  },
  {
    id: "debt-ratio",
    q: "Debt Ratio là gì? Bao nhiêu là an toàn?",
    a: "Debt Ratio đo lường gánh nặng nợ so với thu nhập. Dưới 30% là an toàn, 30–50% cần chú ý và cần lên kế hoạch trả nợ, trên 50% là nguy hiểm — cần ưu tiên trả nợ ngay.",
    formula: "Debt Ratio = Tổng nợ ÷ Thu nhập tháng × 100%",
  },
  {
    id: "health-score",
    q: "Financial Health Score là gì? Điểm bao nhiêu là tốt?",
    a: "Điểm 0–100 đánh giá toàn diện sức khoẻ tài chính dựa trên 10 yếu tố: tỷ lệ tiết kiệm, debt ratio, quỹ khẩn cấp, ROI đầu tư, tuân thủ ngân sách, tiến độ mục tiêu... Điểm ≥ 80 là tốt, 60–79 là khá, dưới 60 cần cải thiện.",
    formula: "Health Score = Σ(10 yếu tố × trọng số) / 100",
  },
  {
    id: "roi",
    q: "ROI là gì? Tính như thế nào?",
    a: "ROI (Return on Investment) là tỷ lệ lợi nhuận so với vốn bỏ ra. ROI dương = đang lãi, âm = đang lỗ. ROI ≥ 10%/năm được coi là tốt với đầu tư thông thường tại Việt Nam. VN-Index trung bình ~12%/năm.",
    formula: "ROI = (Giá trị hiện tại − Vốn đầu tư) ÷ Vốn đầu tư × 100%",
  },
  {
    id: "emergency-fund",
    q: "Quỹ khẩn cấp là gì? Cần bao nhiêu tiền?",
    a: "Quỹ khẩn cấp là khoản tiền thanh khoản cao để đối phó khi mất việc, bệnh tật, sự cố bất ngờ. Không được đầu tư hay tiêu vào việc khác. Mức khuyến nghị: 3–6 tháng tổng chi tiêu sinh hoạt của bạn.",
    formula: "Quỹ khẩn cấp = Chi tiêu/tháng × (3 đến 6 tháng)",
  },
  {
    id: "saving-rate",
    q: "Tỷ lệ tiết kiệm bao nhiêu là đủ?",
    a: "Tỷ lệ tiết kiệm 10% là tối thiểu, 20% là tốt, ≥ 30% là xuất sắc. Người theo đuổi FIRE (Financial Independence, Retire Early) thường tiết kiệm 50–70% thu nhập. Bắt đầu từ 10% và tăng dần.",
    formula: "Tỷ lệ tiết kiệm = (Thu nhập − Chi tiêu) ÷ Thu nhập × 100%",
  },
  {
    id: "faster-goal",
    q: "Làm sao để đạt mục tiêu tài chính nhanh hơn?",
    a: "5 chiến lược: (1) Tăng thu nhập — làm thêm, freelance, đầu tư sinh lời. (2) Giảm chi không cần thiết — review ngân sách mỗi tháng. (3) Tự động hoá tiết kiệm — chuyển tiền đầu tháng trước khi tiêu. (4) Đầu tư tiền tiết kiệm để sinh lãi kép. (5) Theo dõi tiến độ hàng tuần để duy trì động lực.",
  },
  {
    id: "diversification",
    q: "Đa dạng hóa danh mục đầu tư như thế nào?",
    a: "Không đặt tất cả vào một loại tài sản. Ví dụ phân bổ phổ biến cho nhà đầu tư trẻ Việt Nam: 40% cổ phiếu Việt, 20% quỹ ETF, 20% vàng SJC, 10% crypto, 10% tiền mặt/trái phiếu. Điều chỉnh theo độ tuổi và mức chịu rủi ro cá nhân.",
  },
];

// ─── Main Component ──────────────────────────────────────────────────────────
export default function HelpPage() {
  const [search, setSearch] = useState("");
  const [activeGuide, setActiveGuide] = useState<string | null>(null);
  const [openFaq, setOpenFaq] = useState<string | null>(null);
  const [checklist, setChecklist] = useState<Record<string, boolean>>(() => {
    if (typeof window === "undefined") return {};
    try {
      return JSON.parse(localStorage.getItem("mf-checklist") ?? "{}") as Record<string, boolean>;
    } catch {
      return {};
    }
  });

  function toggleCheck(id: string) {
    setChecklist((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      try { localStorage.setItem("mf-checklist", JSON.stringify(next)); } catch { /* noop */ }
      return next;
    });
  }

  const filteredGuides = useMemo(() => {
    if (!search.trim()) return FEATURE_GUIDES;
    const q = search.toLowerCase();
    return FEATURE_GUIDES.filter(
      (g) =>
        g.title.toLowerCase().includes(q) ||
        g.purpose.toLowerCase().includes(q) ||
        g.howTo.some((s) => s.toLowerCase().includes(q)) ||
        g.tips.some((t) => t.toLowerCase().includes(q)) ||
        g.example.toLowerCase().includes(q),
    );
  }, [search]);

  const filteredFaq = useMemo(() => {
    if (!search.trim()) return FAQ_ITEMS;
    const q = search.toLowerCase();
    return FAQ_ITEMS.filter(
      (f) =>
        f.q.toLowerCase().includes(q) ||
        f.a.toLowerCase().includes(q) ||
        (f.formula ?? "").toLowerCase().includes(q),
    );
  }, [search]);

  const checkCount = CHECKLIST_ITEMS.filter((c) => checklist[c.id]).length;
  const checkPct = Math.round((checkCount / CHECKLIST_ITEMS.length) * 100);

  return (
    <div className="space-y-5">
      {/* ════════════════════════════════════════════════════════════════════
          SECTION 1 · Hero Header + AI Search
          ════════════════════════════════════════════════════════════════════ */}
      <section className="overflow-hidden rounded-[2rem] border border-blue-100 shadow-sm">
        <div className="relative bg-gradient-to-br from-blue-50 via-white to-cyan-50 px-6 pb-8 pt-7 sm:px-8">
          <div className="absolute right-6 top-6 opacity-10">
            <BookOpen size={120} className="text-blue-600" />
          </div>

          <p className="relative text-[11px] font-black uppercase tracking-widest text-blue-500">
            Help Center
          </p>
          <h1 className="relative mt-1 text-3xl font-black tracking-tight text-slate-900 sm:text-4xl">
            Hướng Dẫn
          </h1>
          <p className="relative mt-1 text-sm text-slate-500">
            Onboarding, hướng dẫn tính năng, FAQ và mẹo tối ưu tài chính cá nhân.
          </p>

          {/* Search bar */}
          <div className="relative mt-6 flex items-center gap-2.5 rounded-2xl border border-blue-200 bg-white px-4 py-3 shadow-sm transition-all focus-within:border-blue-400 focus-within:shadow-md">
            <Search size={16} className="shrink-0 text-blue-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder='Tìm hướng dẫn... "thêm giao dịch", "ROI", "ngân sách"'
              className="min-w-0 flex-1 bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="shrink-0 text-slate-400 transition-colors hover:text-slate-600"
              >
                <X size={14} />
              </button>
            )}
            {search && (
              <span className="shrink-0 rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-black text-blue-700">
                {filteredGuides.length + filteredFaq.length} kết quả
              </span>
            )}
          </div>

          {/* Stat chips */}
          <div className="relative mt-5 flex flex-wrap gap-2">
            {[
              { label: "11 tính năng", icon: Sparkles },
              { label: "8 câu hỏi", icon: Lightbulb },
              { label: "5 bước bắt đầu", icon: Zap },
            ].map(({ label, icon: Icon }) => (
              <span
                key={label}
                className="flex items-center gap-1.5 rounded-full border border-blue-200 bg-white px-3 py-1.5 text-xs font-bold text-blue-700"
              >
                <Icon size={11} />
                {label}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════════════
          SECTION 2 · Quick Start Flow
          ════════════════════════════════════════════════════════════════════ */}
      {!search && (
        <section className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 bg-gradient-to-r from-blue-50/60 to-cyan-50/40 px-6 py-4">
            <div className="flex items-center gap-2">
              <Star size={14} className="text-blue-600" />
              <p className="text-sm font-black text-slate-800">
                Tôi nên làm gì đầu tiên?
              </p>
            </div>
            <p className="mt-0.5 text-xs text-slate-500">
              Quy trình khuyến nghị để bắt đầu quản lý tài chính hiệu quả.
            </p>
          </div>

          <div className="p-5">
            <div className="-mx-1 flex gap-3 overflow-x-auto pb-2 no-scrollbar px-1">
              {QUICK_FLOW.map((step, i) => (
                <Link
                  key={step.num}
                  href={step.href}
                  className="flex w-44 shrink-0 flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 transition-all hover:border-blue-200 hover:shadow-md hover:shadow-blue-100/60 active:scale-[.98]"
                >
                  <div className="flex items-center gap-2">
                    <div
                      className={[
                        "flex size-7 shrink-0 items-center justify-center rounded-xl text-xs font-black",
                        step.numBg,
                        step.numText,
                      ].join(" ")}
                    >
                      {step.num}
                    </div>
                    {i < QUICK_FLOW.length - 1 && (
                      <div className="h-px flex-1 bg-slate-100" />
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-black text-slate-900">
                      {step.title}
                    </p>
                    <p className="mt-0.5 text-xs leading-5 text-slate-500">
                      {step.desc}
                    </p>
                  </div>
                  <div className="mt-auto flex items-center gap-1 text-[11px] font-bold text-blue-600">
                    Đi tới
                    <ArrowRight size={11} />
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          SECTION 3 · Onboarding Steps
          ════════════════════════════════════════════════════════════════════ */}
      {!search && (
        <section>
          <div className="mb-3 flex items-center gap-2 px-1">
            <div className="size-1.5 rounded-full bg-blue-600" />
            <p className="text-sm font-black text-slate-700">
              Bắt đầu trong 5 bước
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {ONBOARDING_STEPS.map((s) => {
              const Icon = s.icon;
              return (
                <Link
                  key={s.step}
                  href={s.href}
                  className={[
                    "group flex flex-col gap-4 rounded-[2rem] border p-5 transition-all hover:shadow-lg active:scale-[.98]",
                    s.light,
                    s.border,
                  ].join(" ")}
                >
                  <div className="flex items-center justify-between">
                    <div
                      className={[
                        "flex size-10 items-center justify-center rounded-2xl text-white shadow-md",
                        s.bg,
                        "shadow-" + s.shadow,
                      ].join(" ")}
                    >
                      <Icon size={18} strokeWidth={2.5} />
                    </div>
                    <span
                      className={[
                        "flex size-6 items-center justify-center rounded-xl text-xs font-black",
                        s.bg,
                        "text-white",
                      ].join(" ")}
                    >
                      {s.step}
                    </span>
                  </div>
                  <div>
                    <p className={["text-sm font-black", s.text].join(" ")}>
                      {s.title}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-slate-600">
                      {s.desc}
                    </p>
                  </div>
                  <div
                    className={[
                      "mt-auto flex items-center gap-1 text-[11px] font-black",
                      s.text,
                    ].join(" ")}
                  >
                    {s.cta}
                    <ArrowRight size={11} className="transition-transform group-hover:translate-x-0.5" />
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          SECTION 4 · Setup Checklist
          ════════════════════════════════════════════════════════════════════ */}
      {!search && (
        <section className="overflow-hidden rounded-[2rem] border border-emerald-200 bg-white shadow-sm">
          <div className="border-b border-emerald-100 bg-gradient-to-r from-emerald-50/60 to-white px-6 py-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={14} className="text-emerald-600" />
                  <p className="text-sm font-black text-slate-800">
                    Checklist thiết lập
                  </p>
                </div>
                <p className="mt-0.5 text-xs text-slate-500">
                  Hoàn thành để trải nghiệm đầy đủ MyFinance.
                </p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-black text-emerald-600">
                  {checkCount}/{CHECKLIST_ITEMS.length}
                </p>
                <p className="text-xs text-slate-400">hoàn thành</p>
              </div>
            </div>

            {/* Progress bar */}
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-emerald-100">
              <div
                className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-700"
                style={{ width: checkPct + "%" }}
              />
            </div>
            {checkPct === 100 && (
              <p className="mt-1.5 text-xs font-bold text-emerald-600">
                Xuất sắc! Bạn đã thiết lập xong MyFinance.
              </p>
            )}
          </div>

          <div className="divide-y divide-slate-50 p-2">
            {CHECKLIST_ITEMS.map((item) => {
              const done = !!checklist[item.id];
              return (
                <div
                  key={item.id}
                  className="flex items-center gap-4 rounded-2xl px-4 py-3.5 transition-colors hover:bg-slate-50"
                >
                  <button
                    onClick={() => toggleCheck(item.id)}
                    className="shrink-0 transition-all active:scale-90"
                  >
                    {done ? (
                      <CheckCircle2 size={22} className="text-emerald-500" />
                    ) : (
                      <Circle size={22} className="text-slate-300" />
                    )}
                  </button>
                  <div className="min-w-0 flex-1">
                    <p
                      className={[
                        "text-sm font-bold",
                        done ? "text-slate-400 line-through" : "text-slate-800",
                      ].join(" ")}
                    >
                      {item.label}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-400">{item.desc}</p>
                  </div>
                  <Link
                    href={item.href}
                    className="shrink-0 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 transition-all hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
                  >
                    Đi tới
                  </Link>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          SECTION 5 · Feature Guides
          ════════════════════════════════════════════════════════════════════ */}
      <section>
        <div className="mb-3 flex items-center gap-2 px-1">
          <BookOpen size={14} className="text-blue-600" />
          <p className="text-sm font-black text-slate-700">
            Hướng dẫn từng tính năng
          </p>
          {search && (
            <span className="ml-auto rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-black text-blue-700">
              {filteredGuides.length} / {FEATURE_GUIDES.length}
            </span>
          )}
        </div>

        {filteredGuides.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-[2rem] border border-dashed border-slate-200 py-16 text-center">
            <Search size={32} className="text-slate-300" />
            <p className="mt-3 text-sm font-bold text-slate-400">
              Không tìm thấy hướng dẫn phù hợp
            </p>
            <button
              onClick={() => setSearch("")}
              className="mt-3 text-xs font-bold text-blue-600 hover:underline"
            >
              Xoá tìm kiếm
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredGuides.map((guide) => {
              const Icon = guide.icon;
              const open = activeGuide === guide.id;
              return (
                <div
                  key={guide.id}
                  className={[
                    "overflow-hidden rounded-[2rem] border transition-all duration-200",
                    open ? guide.accentBorder + " shadow-md" : "border-slate-200",
                  ].join(" ")}
                >
                  {/* Guide header / toggle */}
                  <button
                    type="button"
                    onClick={() =>
                      setActiveGuide(open ? null : guide.id)
                    }
                    className="flex w-full items-center gap-4 px-6 py-4 text-left transition-colors hover:bg-slate-50"
                  >
                    <div
                      className={[
                        "flex size-10 shrink-0 items-center justify-center rounded-2xl",
                        guide.accentIcon,
                      ].join(" ")}
                    >
                      <Icon size={18} strokeWidth={2} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-black text-slate-900">{guide.title}</p>
                      <p className="mt-0.5 line-clamp-1 text-xs text-slate-500">
                        {guide.purpose}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Link
                        href={guide.href}
                        onClick={(e) => e.stopPropagation()}
                        className={[
                          "hidden items-center gap-1 rounded-xl px-3 py-1.5 text-xs font-bold text-white transition-all hover:opacity-90 sm:flex",
                          guide.accentBg,
                        ].join(" ")}
                      >
                        Mở trang
                        <ArrowRight size={11} />
                      </Link>
                      {open ? (
                        <ChevronUp size={18} className="text-slate-400" />
                      ) : (
                        <ChevronDown size={18} className="text-slate-400" />
                      )}
                    </div>
                  </button>

                  {/* Guide body */}
                  {open && (
                    <div className="border-t border-slate-100 px-6 pb-6 pt-5">
                      <div className="grid gap-5 lg:grid-cols-2">
                        {/* Left col */}
                        <div className="space-y-4">
                          {/* Purpose */}
                          <div>
                            <p className="mb-1.5 text-[11px] font-black uppercase tracking-wide text-slate-400">
                              Mục đích
                            </p>
                            <p className="text-sm leading-6 text-slate-700">
                              {guide.purpose}
                            </p>
                          </div>

                          {/* When */}
                          <div>
                            <p className="mb-1.5 text-[11px] font-black uppercase tracking-wide text-slate-400">
                              Khi nào sử dụng
                            </p>
                            <p className="text-sm leading-6 text-slate-700">
                              {guide.when}
                            </p>
                          </div>

                          {/* How-to steps */}
                          <div>
                            <p className="mb-2 text-[11px] font-black uppercase tracking-wide text-slate-400">
                              Cách sử dụng
                            </p>
                            <ol className="space-y-2">
                              {guide.howTo.map((step, i) => (
                                <li
                                  key={i}
                                  className="flex items-start gap-2.5"
                                >
                                  <span
                                    className={[
                                      "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-lg text-[10px] font-black text-white",
                                      guide.accentBg,
                                    ].join(" ")}
                                  >
                                    {i + 1}
                                  </span>
                                  <span className="text-sm leading-6 text-slate-700">
                                    {step}
                                  </span>
                                </li>
                              ))}
                            </ol>
                          </div>
                        </div>

                        {/* Right col */}
                        <div className="space-y-4">
                          {/* Example */}
                          <div
                            className={[
                              "rounded-2xl border p-4",
                              guide.accentLight,
                              guide.accentBorder,
                            ].join(" ")}
                          >
                            <p
                              className={[
                                "mb-2 text-[11px] font-black uppercase tracking-wide",
                                guide.accentText,
                              ].join(" ")}
                            >
                              Ví dụ thực tế
                            </p>
                            <p className="text-sm leading-6 text-slate-700">
                              {guide.example}
                            </p>
                          </div>

                          {/* Tips */}
                          <div>
                            <p className="mb-2 flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wide text-slate-400">
                              <Lightbulb size={11} />
                              Mẹo tối ưu
                            </p>
                            <ul className="space-y-2">
                              {guide.tips.map((tip, i) => (
                                <li key={i} className="flex items-start gap-2.5">
                                  <Star
                                    size={12}
                                    className={["mt-1 shrink-0", guide.accentText].join(" ")}
                                  />
                                  <span className="text-sm leading-6 text-slate-700">
                                    {tip}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </div>

                          {/* CTA */}
                          <Link
                            href={guide.href}
                            className={[
                              "flex items-center justify-center gap-2 rounded-2xl py-3 text-sm font-bold text-white shadow-md transition-all hover:opacity-90 active:scale-[.98]",
                              guide.accentBg,
                            ].join(" ")}
                          >
                            Mở {guide.title.split(" · ")[0]}
                            <ArrowRight size={14} />
                          </Link>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ════════════════════════════════════════════════════════════════════
          SECTION 6 · Financial Glossary (Tooltip terms)
          ════════════════════════════════════════════════════════════════════ */}
      {!search && (
        <section className="overflow-hidden rounded-[2rem] border border-indigo-200 bg-white shadow-sm">
          <div className="border-b border-indigo-100 bg-gradient-to-r from-indigo-50/60 to-white px-6 py-4">
            <div className="flex items-center gap-2">
              <Lightbulb size={14} className="text-indigo-600" />
              <p className="text-sm font-black text-slate-800">
                Thuật ngữ tài chính
              </p>
            </div>
            <p className="mt-0.5 text-xs text-slate-500">
              Giải thích các chỉ số quan trọng trong MyFinance.
            </p>
          </div>

          <div className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { term: "Financial Health Score", formula: "Tổng hợp 10 yếu tố tài chính", color: "blue", desc: "Điểm 0–100 đánh giá toàn diện sức khoẻ tài chính. ≥ 80 = Tốt, 60–79 = Khá, < 60 = Cần cải thiện." },
              { term: "Net Worth", formula: "Tài sản − Tổng nợ", color: "emerald", desc: "Tài sản ròng — thước đo tài chính quan trọng nhất. Tăng đều = đang trên đường tới tự do tài chính." },
              { term: "Debt Ratio", formula: "Nợ ÷ Thu nhập × 100%", color: "rose", desc: "Tỷ lệ gánh nặng nợ. < 30% = an toàn, 30–50% = cảnh báo, > 50% = nguy hiểm cần xử lý ngay." },
              { term: "ROI", formula: "(Giá trị − Vốn) ÷ Vốn × 100%", color: "cyan", desc: "Return on Investment — tỷ lệ lợi nhuận đầu tư. ROI ≥ 10%/năm là mục tiêu tốt cho nhà đầu tư dài hạn." },
              { term: "Budget Adherence", formula: "Chi thực ÷ Hạn mức × 100%", color: "violet", desc: "Tỷ lệ tuân thủ ngân sách. 100% = vượt ngân sách. Mục tiêu: < 80% để có biên độ an toàn." },
              { term: "Saving Rate", formula: "(Thu − Chi) ÷ Thu × 100%", color: "amber", desc: "Tỷ lệ tiết kiệm. Tối thiểu 10%, tốt 20%, xuất sắc ≥ 30%. Tiết kiệm sớm = hưởng lãi kép lâu hơn." },
            ].map(({ term, formula, color, desc }) => (
              <div
                key={term}
                className={[
                  "rounded-2xl border p-4",
                  "border-" + color + "-200",
                  "bg-" + color + "-50/50",
                ].join(" ")}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className={["text-sm font-black", "text-" + color + "-700"].join(" ")}>
                    {term}
                  </p>
                </div>
                <div className={["mt-2 rounded-xl px-3 py-1.5", "bg-" + color + "-100"].join(" ")}>
                  <p className={["font-mono text-[11px] font-bold", "text-" + color + "-700"].join(" ")}>
                    {formula}
                  </p>
                </div>
                <p className="mt-2 text-xs leading-5 text-slate-600">{desc}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          SECTION 7 · FAQ
          ════════════════════════════════════════════════════════════════════ */}
      <section>
        <div className="mb-3 flex items-center gap-2 px-1">
          <div className="size-1.5 rounded-full bg-amber-500" />
          <p className="text-sm font-black text-slate-700">
            Câu hỏi thường gặp
          </p>
          {search && (
            <span className="ml-auto rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-black text-amber-700">
              {filteredFaq.length} / {FAQ_ITEMS.length}
            </span>
          )}
        </div>

        {filteredFaq.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-[2rem] border border-dashed border-slate-200 py-12 text-center">
            <p className="text-sm text-slate-400">Không có câu hỏi phù hợp với tìm kiếm.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredFaq.map((faq) => {
              const open = openFaq === faq.id;
              return (
                <div
                  key={faq.id}
                  className={[
                    "overflow-hidden rounded-[2rem] border transition-all",
                    open
                      ? "border-amber-300 shadow-sm"
                      : "border-slate-200 hover:border-amber-200",
                  ].join(" ")}
                >
                  <button
                    type="button"
                    onClick={() => setOpenFaq(open ? null : faq.id)}
                    className="flex w-full items-center gap-3 px-6 py-4 text-left transition-colors hover:bg-amber-50/40"
                  >
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-xs font-black text-amber-700">
                      ?
                    </div>
                    <p className="flex-1 text-sm font-bold text-slate-800">
                      {faq.q}
                    </p>
                    {open ? (
                      <ChevronUp size={16} className="shrink-0 text-amber-500" />
                    ) : (
                      <ChevronDown size={16} className="shrink-0 text-slate-400" />
                    )}
                  </button>

                  {open && (
                    <div className="border-t border-amber-100 bg-amber-50/30 px-6 pb-5 pt-4">
                      <p className="text-sm leading-6 text-slate-700">{faq.a}</p>
                      {faq.formula && (
                        <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-100/60 px-4 py-3">
                          <p className="text-[10px] font-black uppercase tracking-wide text-amber-600">
                            Công thức
                          </p>
                          <p className="mt-1 font-mono text-sm font-bold text-amber-800">
                            {faq.formula}
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ════════════════════════════════════════════════════════════════════
          SECTION 8 · Footer CTA
          ════════════════════════════════════════════════════════════════════ */}
      {!search && (
        <section className="overflow-hidden rounded-[2rem] border border-blue-200 bg-gradient-to-br from-blue-600 via-blue-700 to-cyan-600 shadow-lg shadow-blue-200/60">
          <div className="px-6 py-7 text-center sm:px-10">
            <p className="text-[11px] font-black uppercase tracking-widest text-blue-200">
              Sẵn sàng bắt đầu?
            </p>
            <h2 className="mt-2 text-2xl font-black text-white">
              Bắt đầu quản lý tài chính ngay hôm nay
            </h2>
            <p className="mt-2 text-sm text-blue-200">
              Mỗi ngày theo dõi tài chính = mỗi ngày gần hơn tới tự do tài chính.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Link
                href="/transactions"
                className="flex items-center gap-2 rounded-2xl bg-white px-5 py-2.5 text-sm font-bold text-blue-700 shadow-md transition-all hover:bg-blue-50 active:scale-95"
              >
                <ReceiptText size={15} />
                Thêm giao dịch
              </Link>
              <Link
                href="/wallets"
                className="flex items-center gap-2 rounded-2xl border border-white/30 bg-white/10 px-5 py-2.5 text-sm font-bold text-white transition-all hover:bg-white/20 active:scale-95"
              >
                <Wallet size={15} />
                Tạo ví tiền
              </Link>
              <Link
                href="/ai-insights"
                className="flex items-center gap-2 rounded-2xl border border-white/30 bg-white/10 px-5 py-2.5 text-sm font-bold text-white transition-all hover:bg-white/20 active:scale-95"
              >
                <Bot size={15} />
                Xem AI Insights
              </Link>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
