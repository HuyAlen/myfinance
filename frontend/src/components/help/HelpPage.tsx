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
import {
  CHECKLIST_ITEMS,
  useOnboarding,
  type ChecklistItemId,
} from "../onboarding/OnboardingProvider";

// HELP-CANONICAL-FINANCE-1
// Help copy mirrors the product's current canonical finance semantics. This
// page stays informational only: calculation authority remains in the shared
// finance services and each feature page.

type IconComponent = React.ComponentType<{
  size?: number;
  strokeWidth?: number;
}>;

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
    desc: "Thiết lập mục tiêu tiết kiệm có kỳ hạn để theo dõi tiến độ tài chính.",
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

// ONBOARDING-SSOT-1
// Help renders the exact same checklist model/state as the global onboarding
// surfaces. Persistence and legacy migration live only in OnboardingProvider.

const QUICK_FLOW: QuickFlowStep[] = [
  { num: 1, title: "Tạo ví", desc: "Thêm tài khoản ngân hàng, tiền mặt", href: "/wallets", numBg: "bg-blue-600", numText: "text-white" },
  { num: 2, title: "Thêm giao dịch", desc: "Ghi chép thu chi hàng ngày", href: "/transactions", numBg: "bg-emerald-600", numText: "text-white" },
  { num: 3, title: "Tạo ngân sách", desc: "Kiểm soát chi tiêu theo tháng", href: "/budgets", numBg: "bg-cyan-600", numText: "text-white" },
  { num: 4, title: "Tạo mục tiêu", desc: "Đặt mục tiêu tiết kiệm cụ thể", href: "/goals", numBg: "bg-indigo-600", numText: "text-white" },
  { num: 5, title: "Theo dõi Tổng quan", desc: "Xem tổng quan tài chính mỗi ngày", href: "/", numBg: "bg-violet-600", numText: "text-white" },
  { num: 6, title: "Xem Phân tích AI", desc: "Xem phân tích và gợi ý từ dữ liệu", href: "/ai-insights", numBg: "bg-rose-500", numText: "text-white" },
];

const FEATURE_GUIDES: Guide[] = [
  {
    id: "dashboard",
    title: "Tổng quan",
    icon: Home,
    href: "/",
    accentBg: "bg-blue-600",
    accentLight: "bg-blue-50",
    accentText: "text-blue-700",
    accentBorder: "border-blue-200",
    accentIcon: "bg-blue-100 text-blue-600",
    purpose: "Xem nhanh tình hình tài chính trong một màn hình: Tài sản ròng, dòng tiền, quỹ khẩn cấp, ngân sách, mục tiêu và các chỉ số sức khỏe tài chính.",
    when: "Mở khi cần đánh giá nhanh trạng thái tài chính hiện tại hoặc kiểm tra xu hướng theo kỳ.",
    howTo: [
      "Mở MyFinance → Tổng quan hiển thị ngay trang chủ",
      "Đọc Tài sản ròng theo bảng cân đối tài sản chuẩn: Ví tiền + Tiết kiệm + Danh mục đầu tư + Ngoại hối − Tổng nợ",
      "Kiểm tra Thu, Chi thực và dòng tiền của kỳ đang chọn",
      "Xem Quỹ khẩn cấp theo số tháng chi tiêu thực bình quân của các tháng đã hoàn tất — không dùng tháng hiện tại đang chạy dở làm mẫu số",
      "Mở các hành động/gợi ý để đi tới đúng trang dữ liệu cần xử lý",
    ],
    example: "Đầu tháng mới chỉ phát sinh một ít chi tiêu, Tổng quan vẫn không dùng khoản chi nhỏ của vài ngày đầu tháng để kết luận quỹ khẩn cấp đủ hàng chục tháng; mức dự phòng dựa trên mức chi tham chiếu của các tháng đã hoàn tất.",
    tips: [
      "Tài sản ròng là bản ghi hiện tại, còn dòng tiền phụ thuộc kỳ đang chọn",
      "Tiết kiệm, Danh mục đầu tư và Ngoại hối đều là tài sản riêng trên bảng cân đối tài sản, không nằm trong số dư Ví",
      "Nếu chưa đủ dữ liệu tháng hoàn tất, mức dự phòng quỹ khẩn cấp có thể hiển thị chưa đủ dữ liệu thay vì kết luận sai",
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
    purpose: "Ghi chép thu nhập, chi tiêu và chuyển tiền giữa các ví. Đây là nguồn dữ liệu dòng tiền cho Tổng quan, Ngân sách và Báo cáo.",
    when: "Sau khi phát sinh thu nhập, chi tiêu hoặc chuyển tiền cần được ghi nhận.",
    howTo: [
      "Nhấn 'Thêm giao dịch'",
      "Chọn đúng loại: Thu nhập / Chi tiêu / Chuyển tiền",
      "Nhập số tiền, danh mục, ví và ngày giao dịch",
      "Dùng Chuyển tiền khi di chuyển tiền giữa các ví của chính bạn",
      "Lưu để cập nhật sổ cái và các chỉ số liên quan",
    ],
    example: "Chi 45.000đ ăn sáng được tính là chi thực. Chuyển 2M từ ngân hàng sang ví khác của bạn là chuyển tiền nội bộ, không phải một khoản chi tiêu mới.",
    tips: [
      "Ghi giao dịch sớm để số liệu theo kỳ chính xác",
      "Không đổi chuyển tiền thành chi tiêu chỉ để khớp số dư",
      "Các khoản phân bổ tương lai như Tiết kiệm/Đầu tư được theo dõi tách khỏi chi tiêu sinh hoạt thực",
      "Dùng bộ lọc và CSV khi cần đối soát chi tiết",
    ],
  },
  {
    id: "wallets",
    title: "Ví Tiền · Thanh khoản",
    icon: Wallet,
    href: "/wallets",
    accentBg: "bg-cyan-600",
    accentLight: "bg-cyan-50",
    accentText: "text-cyan-700",
    accentBorder: "border-cyan-200",
    accentIcon: "bg-cyan-100 text-cyan-600",
    purpose: "Quản lý tiền mặt, tài khoản ngân hàng và ví điện tử. Ví là phần tài sản thanh khoản có thể chi tiêu; Tiết kiệm, Danh mục đầu tư và Ngoại hối được quản lý ở phân hệ riêng.",
    when: "Khi mở tài khoản thanh toán mới, cần đối soát số dư hoặc muốn xem tiền có thể chi tiêu ngay.",
    howTo: [
      "Vào 'Ví Tiền' → nhấn 'Thêm ví tiền'",
      "Chọn loại ví phù hợp như tiền mặt, ngân hàng hoặc ví điện tử",
      "Nhập tên ví và số dư hiện tại",
      "Dùng giao dịch để ghi nhận các thay đổi số dư thường xuyên",
      "Dùng 'Chuyển tiền' khi chuyển giữa hai ví để không làm tăng chi tiêu thực",
    ],
    example: "MB Bank 48M + Tiền mặt 1,5M + MoMo 300K là phần Ví. Một sổ tiết kiệm 20M và Danh mục đầu tư 30M vẫn góp vào Tài sản ròng nhưng không được cộng lẫn vào số dư Ví.",
    tips: [
      "Tách từng tài khoản thực tế thành từng ví để dễ đối soát",
      "Không tạo ví giả để đại diện cho Tiết kiệm hoặc Danh mục đầu tư nếu đã dùng đúng phân hệ tương ứng",
      "Số dư Ví không đồng nghĩa với Tổng tài sản",
      "Dùng chuyển tiền cho luồng tiền nội bộ giữa các ví",
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
    purpose: "Phân loại thu nhập và chi tiêu thành các nhóm rõ ràng để Ngân sách, Báo cáo và các phân tích dùng cùng một ngữ nghĩa.",
    when: "Khi thiết lập lần đầu hoặc khi phát sinh một loại thu/chi mới chưa có danh mục phù hợp.",
    howTo: [
      "Vào 'Danh Mục' → xem danh sách hiện có",
      "Nhấn 'Thêm danh mục' để tạo loại mới",
      "Chọn đúng loại Thu nhập hoặc Chi tiêu",
      "Dùng danh mục đó khi tạo giao dịch",
      "Rà soát danh mục không còn dùng để giữ báo cáo dễ đọc",
    ],
    example: "Chi: Ăn uống, Đi lại, Nhà ở, Y tế. Thu: Lương, Làm tự do, Thưởng. Chuyển tiền không cần được ngụy trang thành một danh mục chi.",
    tips: [
      "Giữ danh mục đủ chi tiết nhưng tránh trùng nghĩa",
      "Hạn chế danh mục 'Khác' nếu có thể phân loại rõ",
      "Ngân sách và Báo cáo dùng phân loại chi thực nhất quán",
      "Rà soát định kỳ để tránh dữ liệu bị phân mảnh",
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
    purpose: "Đặt hạn mức chi tiêu theo danh mục cho từng tháng và so sánh với chi tiêu thực được phân loại theo chuẩn.",
    when: "Đầu tháng hoặc khi cần điều chỉnh hạn mức cho một danh mục cụ thể.",
    howTo: [
      "Vào 'Ngân Sách' → nhấn 'Thêm ngân sách'",
      "Chọn danh mục và tháng áp dụng",
      "Nhập hạn mức phù hợp với kế hoạch của bạn",
      "Theo dõi phần đã chi từ các giao dịch chi thực của danh mục",
      "Rà soát các danh mục gần/vượt hạn mức và điều chỉnh hành vi hoặc kế hoạch khi cần",
    ],
    example: "Ngân sách Ăn uống 3M; chi thực đã ghi nhận 1,8M thì tiến độ là 60%. Chuyển tiền nội bộ hoặc khoản phân bổ Tiết kiệm/Đầu tư không được biến thành chi ăn uống.",
    tips: [
      "Đặt ngân sách dựa trên dữ liệu thực tế và ưu tiên của bạn",
      "Bắt đầu với 3–5 danh mục chi lớn nhất",
      "Theo dõi chi tiêu theo danh mục và ngân sách bạn tự thiết lập",
      "Không cần ép kế hoạch vào một tỷ lệ phân bổ cố định cho mọi người",
    ],
  },
  {
    id: "goals",
    title: "Mục Tiêu · Tiến độ nguồn vốn",
    icon: Target,
    href: "/goals",
    accentBg: "bg-rose-600",
    accentLight: "bg-rose-50",
    accentText: "text-rose-700",
    accentBorder: "border-rose-200",
    accentIcon: "bg-rose-100 text-rose-600",
    purpose: "Thiết lập mục tiêu tài chính và theo dõi tiến độ bằng bản ghi nguồn vốn chuẩn, có thể kết hợp số tiền gốc của Mục tiêu với Tiết kiệm được liên kết và các giao dịch cấp vốn tương ứng.",
    when: "Khi lập quỹ khẩn cấp, kế hoạch mua sắm lớn hoặc mục tiêu tài chính có số tiền đích.",
    howTo: [
      "Vào 'Mục Tiêu' → nhấn 'Thêm mục tiêu'",
      "Đặt tên, số tiền mục tiêu và hạn hoàn thành nếu cần",
      "Liên kết đúng tài khoản Tiết kiệm khi muốn Tiết kiệm tự đóng góp vào tiến độ Mục tiêu",
      "Theo dõi số tiền hiệu lực và % tiến độ từ bản ghi nguồn vốn chuẩn",
      "Dùng dự báo/gợi ý mức đóng góp để điều chỉnh kế hoạch thay vì nhập trùng tiền ở nhiều nơi",
    ],
    example: "Mục tiêu Quỹ khẩn cấp 120M liên kết với Tiết kiệm đang có 13,07M sẽ phản ánh khoảng 11% tiến độ mà không cần cộng thủ công lại cùng một số tiền ở hai nơi.",
    tips: [
      "Liên kết đúng Tiết kiệm để tránh tiến độ Mục tiêu lệch với số dư thực",
      "Không cộng cùng một khoản nguồn vốn hai lần",
      "Quỹ khẩn cấp thường đặt mục tiêu theo nhiều tháng chi tiêu, nhưng % Mục tiêu và số tháng dự phòng là hai chỉ số khác nhau",
      "Rà soát tiến độ theo dòng tiền thực tế thay vì chỉ nhìn hạn hoàn thành",
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
    purpose: "Theo dõi dư nợ và lập kế hoạch trả nợ. Trang phân biệt tỷ lệ nợ trên tài sản với gánh nặng trả nợ hàng tháng trên thu nhập.",
    when: "Khi thêm khoản vay, cập nhật dư nợ hoặc cần xác định khoản nên ưu tiên thanh toán.",
    howTo: [
      "Vào 'Nợ & Khoản Vay' → nhấn 'Thêm khoản nợ'",
      "Nhập số dư nợ, lãi suất và mức trả tối thiểu nếu có",
      "Cập nhật dư nợ còn lại theo tiến độ thanh toán",
      "Xem Tỷ lệ nợ = Tổng dư nợ ÷ Tổng tài sản để đánh giá đòn bẩy trên bảng cân đối tài sản",
      "Xem Gợi ý trả nợ; chiến lược ưu tiên lãi suất cao tập trung vào khoản có lãi suất cao hơn",
    ],
    example: "Nếu tổng dư nợ là 200M và tổng tài sản hiện tại là 1 tỷ thì Tỷ lệ nợ là 20%. Nếu tổng mức trả tối thiểu mỗi tháng là 12M trên thu nhập tháng 40M thì gánh nặng trả nợ tháng là 30% — đây là chỉ số khác.",
    tips: [
      "Tỷ lệ nợ trong MyFinance là dư nợ / tổng tài sản, không phải dư nợ / thu nhập tháng",
      "Gánh nặng trả nợ tháng dùng tổng khoản trả tối thiểu / thu nhập tháng",
      "Ưu tiên khoản có lãi suất cao nhất để giảm chi phí lãi",
      "Các gợi ý trả nợ được xác định theo quy tắc; không gắn nhãn AI khi không có AI tham gia",
    ],
  },
  {
    id: "investments",
    title: "Đầu Tư · Danh mục đầu tư & Ngoại hối",
    icon: BriefcaseBusiness,
    href: "/investments",
    accentBg: "bg-teal-600",
    accentLight: "bg-teal-50",
    accentText: "text-teal-700",
    accentBorder: "border-teal-200",
    accentIcon: "bg-teal-100 text-teal-600",
    purpose: "Quản lý Danh mục đầu tư (cổ phiếu, tài sản mã hóa, quỹ ETF, vàng) và tài khoản Ngoại hối trong cùng một không gian; Ngoại hối tập trung vào Số dư, Nạp, Rút và Lợi nhuận.",
    when: "Khi mua/bán tài sản trong Danh mục đầu tư, nạp/rút vốn Ngoại hối, cập nhật Số dư hoặc muốn đánh giá hiệu suất đầu tư tổng thể.",
    howTo: [
      "Vào 'Đầu Tư' → 'Thêm tài sản' để quản lý cổ phiếu / Tài sản mã hóa / Quỹ ETF / Vàng / Khác",
      "Nhập tên, mã (nếu có), vốn đầu tư và giá trị hiện tại của Danh mục đầu tư",
      "Dùng 'Thêm ngoại hối' để tạo tài khoản sàn và nhập Số dư hiện tại",
      "Ghi nhận Nạp / Rút trên từng tài khoản Ngoại hối để theo dõi dòng tiền",
      "Danh mục đầu tư giữ Lãi/lỗ và Tỷ suất lợi nhuận riêng; Ngoại hối dùng Số dư / Nạp / Rút / Lợi nhuận",
    ],
    example: "FPT: vốn 20M → giá trị 24,8M; tài khoản Ngoại hối chính có Số dư 30M. Trang Đầu Tư hiển thị riêng hiệu suất Danh mục đầu tư/Ngoại hối và tổng giá trị đầu tư 54,8M.",
    tips: [
      "Đánh giá Tỷ suất lợi nhuận trong bối cảnh thời gian và rủi ro, không dùng một ngưỡng lợi nhuận cố định cho mọi tài sản",
      "Cập nhật giá trị hiện tại / Số dư Ngoại hối để bản ghi hiện tại chính xác",
      "Danh mục đầu tư và Ngoại hối là hai nguồn dữ liệu riêng nhưng cùng đóng góp vào bảng cân đối tài sản",
      "Phân bổ tài sản nên phù hợp khẩu vị rủi ro và thời hạn của chính bạn, không có một tỷ lệ mẫu đúng cho tất cả",
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
    purpose: "Phân tích tài chính theo kỳ bằng cùng bảng cân đối tài sản và ngữ nghĩa dòng tiền với Tổng quan: tài sản/nợ hiện tại, thu nhập, chi thực và các khoản phân bổ tương lai được tách rõ.",
    when: "Cuối tháng, cuối quý hoặc khi cần đối chiếu xu hướng giữa các kỳ.",
    howTo: [
      "Vào 'Báo cáo' và chọn kỳ cần phân tích",
      "Đọc Tài sản ròng từ bảng cân đối tài sản chuẩn hiện tại",
      "Xem Thu nhập và Chi thực của kỳ",
      "Xem phân bổ Tiết kiệm/Đầu tư tách khỏi chi tiêu thực để biết tiền đã được phân bổ cho tương lai",
      "Dùng các biểu đồ và chức năng xuất dữ liệu để đối soát theo danh mục/kỳ",
    ],
    example: "Trong một kỳ có Thu 30M, Chi thực 18M và phân bổ 5M sang Tiết kiệm/Đầu tư, Báo cáo giữ 18M là chi tiêu thực và 5M là phân bổ tương lai thay vì cộng cả hai thành 23M chi tiêu sinh hoạt.",
    tips: [
      "So sánh các kỳ cùng ngữ nghĩa thay vì chỉ nhìn một con số tổng",
      "Chuyển tiền nội bộ không tạo thêm chi tiêu",
      "Phân bổ Tiết kiệm/Đầu tư được theo dõi riêng khỏi chi thực",
      "Tài sản ròng hiện tại và dòng tiền theo kỳ là hai lát cắt khác nhau",
    ],
  },
  {
    id: "ai-insights",
    title: "Phân tích AI",
    icon: Bot,
    href: "/ai-insights",
    accentBg: "bg-fuchsia-600",
    accentLight: "bg-fuchsia-50",
    accentText: "text-fuchsia-700",
    accentBorder: "border-fuchsia-200",
    accentIcon: "bg-fuchsia-100 text-fuchsia-600",
    purpose: "Xem các phân tích, dự báo và gợi ý dựa trên dữ liệu tài chính đã ghi nhận. AI không thay thế dữ liệu nguồn hoặc các dịch vụ tính toán chuẩn.",
    when: "Khi muốn hiểu xu hướng, bất thường hoặc cần một góc nhìn bổ sung từ dữ liệu đã có.",
    howTo: [
      "Vào 'Phân tích AI'",
      "Kiểm tra dữ liệu/kỳ mà phân tích đang dựa vào",
      "Đọc Sức khỏe/Rủi ro/Dự báo theo ngữ cảnh thay vì xem như cam kết kết quả",
      "Mở trang nguồn khi cần kiểm tra giao dịch, nợ, đầu tư hoặc mục tiêu cụ thể",
      "Ưu tiên sửa dữ liệu nguồn nếu phân tích phản ánh số liệu chưa đầy đủ",
    ],
    example: "Nếu một phân tích cảnh báo chi tiêu tăng, hãy mở Giao dịch/Báo cáo để kiểm tra chi tiêu thực và danh mục trước khi hành động.",
    tips: [
      "AI chỉ hữu ích khi dữ liệu đầu vào đủ và đúng",
      "Phân biệt gợi ý AI với các quy tắc xác định trên các trang khác",
      "Không dùng dự báo như một cam kết lợi nhuận",
      "Đối chiếu lại dữ liệu nguồn trước quyết định tài chính quan trọng",
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
    purpose: "Quản lý hồ sơ, giao diện, cấu hình AI, gia đình và các tùy chọn ứng dụng có sẵn.",
    when: "Khi cần thay đổi thông tin cá nhân, giao diện hoặc cấu hình tính năng.",
    howTo: [
      "Vào 'Cài Đặt'",
      "Cập nhật hồ sơ và tùy chọn tài khoản",
      "Chọn giao diện sáng / tối / theo hệ thống",
      "Kiểm tra các cấu hình AI nếu bạn sử dụng tính năng tài chính AI",
      "Rà soát gia đình và các thiết lập dữ liệu đang khả dụng",
    ],
    example: "Bạn có thể chọn Chế độ tối trong Cài đặt hoặc dùng nút chuyển nhanh trên thanh đầu trang; giao diện vẫn dùng cùng một nguồn cấu hình.",
    tips: [
      "Không chia sẻ khóa AI hoặc thông tin đăng nhập",
      "Rà soát thiết lập sau khi thay đổi thiết bị",
      "Giữ cấu hình đồng bộ với cách bạn thực sự dùng ứng dụng",
      "Dùng Hướng dẫn khi cần hiểu ngữ nghĩa trước khi thay đổi dữ liệu tài chính",
    ],
  },
];

const FAQ_ITEMS: FaqItem[] = [
  {
    id: "net-worth",
    q: "Tài sản ròng trong MyFinance được tính thế nào?",
    a: "MyFinance dùng một bảng cân đối tài sản chuẩn cho bản ghi hiện tại. Ví tiền, Tiết kiệm, Danh mục đầu tư và Ngoại hối cùng đóng góp vào Tổng tài sản; sau đó trừ Tổng nợ. Vì vậy số dư Ví chỉ là một phần của Tài sản ròng, không phải toàn bộ tài sản.",
    formula: "Tài sản ròng = Ví tiền + Tiết kiệm + Danh mục đầu tư + Ngoại hối − Tổng nợ",
  },
  {
    id: "debt-ratio",
    q: "Tỷ lệ nợ khác gánh nặng trả nợ hàng tháng thế nào?",
    a: "Tỷ lệ nợ trong phân hệ Nợ đo dư nợ còn lại so với Tổng tài sản hiện tại. Gánh nặng trả nợ hàng tháng là chỉ số khác: tổng mức trả tối thiểu hàng tháng so với thu nhập tháng. Không dùng Tổng nợ ÷ Thu nhập tháng để gọi là Tỷ lệ nợ.",
    formula: "Tỷ lệ nợ = Tổng dư nợ ÷ Tổng tài sản × 100% · Tỷ lệ trả nợ / thu nhập = Tổng khoản trả tối thiểu ÷ Thu nhập tháng × 100%",
  },
  {
    id: "health-score",
    q: "Điểm sức khỏe tài chính là gì?",
    a: "Đây là điểm 0–100 tổng hợp 10 yếu tố có trọng số như tỷ lệ tiết kiệm, dòng tiền, tỷ lệ nợ, quỹ khẩn cấp, tiến độ mục tiêu và tuân thủ ngân sách. Hãy xem điểm cùng các yếu tố/ghi chú đi kèm thay vì coi một ngưỡng duy nhất là kết luận tài chính tuyệt đối.",
  },
  {
    id: "roi",
    q: "Tỷ suất lợi nhuận là gì? Tính như thế nào?",
    a: "Tỷ suất lợi nhuận đo mức lãi/lỗ so với vốn đã đầu tư. Không có một ngưỡng tỷ suất lợi nhuận cố định phù hợp cho mọi tài sản; cần đọc cùng thời gian nắm giữ, mức rủi ro và loại tài sản.",
    formula: "Tỷ suất lợi nhuận = (Giá trị hiện tại − Vốn đầu tư) ÷ Vốn đầu tư × 100%",
  },
  {
    id: "emergency-fund",
    q: "Quỹ khẩn cấp và số tháng dự phòng được tính thế nào?",
    a: "Mục tiêu quỹ thường được đặt theo nhiều tháng chi tiêu. Trên Tổng quan, số tháng dự phòng dùng số dư quỹ chia cho chi tiêu thực bình quân của tối đa 6 tháng đã hoàn tất gần nhất có dữ liệu; tháng hiện tại đang chạy dở không được dùng làm mẫu số chính. Nếu chưa có đủ bằng chứng tháng hoàn tất, Tổng quan có thể hiển thị chưa đủ dữ liệu thay vì báo đạt sai.",
    formula: "Số tháng quỹ khẩn cấp = Số dư quỹ ÷ Chi tiêu thực bình quân các tháng đã hoàn tất",
  },
  {
    id: "saving-rate",
    q: "Tỷ lệ tiết kiệm trong MyFinance nên đọc thế nào?",
    a: "Tỷ lệ tiết kiệm phản ánh phần thu nhập còn lại sau chi tiêu thực. Phân bổ Tiết kiệm/Đầu tư được theo dõi riêng như phân bổ cho tương lai, nên cần phân biệt chúng với chi tiêu sinh hoạt khi đọc Báo cáo và Tổng quan.",
    formula: "Tỷ lệ tiết kiệm = (Thu nhập − Chi tiêu thực) ÷ Thu nhập × 100%",
  },
  {
    id: "goal-funding",
    q: "Vì sao tiến độ Mục tiêu có thể thay đổi theo Tiết kiệm?",
    a: "Mục tiêu dùng bản ghi nguồn vốn chuẩn. Khi Mục tiêu được liên kết với Tiết kiệm, số dư/nguồn vốn hợp lệ từ tài khoản liên kết có thể đóng góp vào số tiền hiện có hiệu lực. Cơ chế này giúp Mục tiêu và Tiết kiệm không hiển thị hai tiến độ mâu thuẫn cho cùng một nguồn tiền.",
  },
  {
    id: "diversification",
    q: "Nên phân bổ Danh mục đầu tư theo tỷ lệ nào?",
    a: "Không có một tỷ lệ cổ phiếu, ETF, vàng, tài sản mã hóa hay tiền mặt cố định phù hợp với mọi người. Hãy đa dạng hóa theo thời hạn mục tiêu, nhu cầu thanh khoản và mức chịu rủi ro của bạn; MyFinance theo dõi giá trị/tỷ suất lợi nhuận chứ không áp một công thức phân bổ bắt buộc.",
  },
];

const GLOSSARY_ITEMS = [
  {
    term: "Tài sản ròng",
    formula: "Ví + Tiết kiệm + Danh mục đầu tư + Ngoại hối − Nợ",
    color: "emerald",
    desc: "Bản ghi tài sản ròng hiện tại theo bảng cân đối tài sản chuẩn. Số dư Ví chỉ là một phần của Tổng tài sản.",
  },
  {
    term: "Tỷ lệ nợ",
    formula: "Dư nợ ÷ Tổng tài sản × 100%",
    color: "rose",
    desc: "Mức đòn bẩy trên bảng cân đối tài sản. Đây không phải tỷ lệ dư nợ chia cho thu nhập tháng.",
  },
  {
    term: "Tỷ lệ trả nợ / thu nhập",
    formula: "Khoản trả tối thiểu ÷ Thu nhập tháng × 100%",
    color: "amber",
    desc: "Gánh nặng thanh toán nợ hàng tháng, được tách khỏi Tỷ lệ nợ.",
  },
  {
    term: "Mức dự phòng khẩn cấp",
    formula: "Số dư quỹ ÷ TB chi thực tháng hoàn tất",
    color: "blue",
    desc: "Tổng quan dùng mức chi tham chiếu ổn định từ tối đa 6 tháng đã hoàn tất, không phóng đại mức dự phòng vì đầu tháng mới chi ít.",
  },
  {
    term: "Tỷ suất lợi nhuận",
    formula: "(Giá trị − Vốn) ÷ Vốn × 100%",
    color: "cyan",
    desc: "Tỷ lệ lãi/lỗ đầu tư. Cần đọc cùng thời gian và rủi ro; không có một ngưỡng tốt cố định cho mọi tài sản.",
  },
  {
    term: "Mức tuân thủ ngân sách",
    formula: "Chi thực danh mục ÷ Hạn mức × 100%",
    color: "violet",
    desc: "So sánh chi tiêu thực của danh mục với ngân sách. Chuyển tiền và phân bổ tương lai không được biến thành chi sinh hoạt.",
  },
] as const;

export default function HelpPage() {
  const [search, setSearch] = useState("");
  const [activeGuide, setActiveGuide] = useState<string | null>(null);
  const [openFaq, setOpenFaq] = useState<string | null>(null);
  const {
    checklist,
    checklistCount: checkCount,
    checklistTotal,
    isFullyOnboarded,
    setChecklistItem,
  } = useOnboarding();

  function toggleCheck(id: ChecklistItemId) {
    setChecklistItem(id, !checklist[id]);
  }

  // Accent-insensitive search is intentionally left to HELP-UX-1.
  const filteredGuides = useMemo(() => {
    if (!search.trim()) return FEATURE_GUIDES;
    const q = search.toLowerCase();
    return FEATURE_GUIDES.filter(
      (guide) =>
        guide.title.toLowerCase().includes(q) ||
        guide.purpose.toLowerCase().includes(q) ||
        guide.howTo.some((step) => step.toLowerCase().includes(q)) ||
        guide.tips.some((tip) => tip.toLowerCase().includes(q)) ||
        guide.example.toLowerCase().includes(q),
    );
  }, [search]);

  const filteredFaq = useMemo(() => {
    if (!search.trim()) return FAQ_ITEMS;
    const q = search.toLowerCase();
    return FAQ_ITEMS.filter(
      (faq) =>
        faq.q.toLowerCase().includes(q) ||
        faq.a.toLowerCase().includes(q) ||
        (faq.formula ?? "").toLowerCase().includes(q),
    );
  }, [search]);

  const checkPct = checklistTotal > 0
    ? Math.round((checkCount / checklistTotal) * 100)
    : 0;

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-4xl border border-blue-100 shadow-sm">
        <div className="relative bg-linear-to-br from-blue-50 via-white to-cyan-50 px-6 pb-8 pt-7 sm:px-8">
          <div className="absolute right-6 top-6 opacity-10">
            <BookOpen size={120} className="text-blue-600" />
          </div>

          <p className="relative text-[11px] font-black uppercase tracking-widest text-blue-500">
            Trung tâm hướng dẫn
          </p>
          <h1 className="relative mt-1 text-3xl font-black tracking-tight text-slate-900 sm:text-4xl">
            Hướng Dẫn
          </h1>
          <p className="relative mt-1 text-sm text-slate-500">
            Thiết lập ban đầu, hướng dẫn tính năng, câu hỏi thường gặp và ngữ nghĩa tài chính đang dùng trong MyFinance.
          </p>

          <div className="relative mt-6 flex items-center gap-2.5 rounded-2xl border border-blue-200 bg-white px-4 py-3 shadow-sm transition-all focus-within:border-blue-400 focus-within:shadow-md">
            <Search size={16} className="shrink-0 text-blue-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder='Tìm hướng dẫn... "tài sản ròng", "nợ", "quỹ khẩn cấp"'
              className="min-w-0 flex-1 bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400"
            />
            {search ? (
              <button
                type="button"
                onClick={() => setSearch("")}
                aria-label="Xóa tìm kiếm"
                className="shrink-0 text-slate-400 transition-colors hover:text-slate-600"
              >
                <X size={14} />
              </button>
            ) : null}
            {search ? (
              <span className="shrink-0 rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-black text-blue-700">
                {filteredGuides.length + filteredFaq.length} kết quả
              </span>
            ) : null}
          </div>

          <div className="relative mt-5 flex flex-wrap gap-2">
            {[
              { label: `${FEATURE_GUIDES.length} tính năng`, icon: Sparkles },
              { label: `${FAQ_ITEMS.length} câu hỏi`, icon: Lightbulb },
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

      {!search ? (
        <section className="overflow-hidden rounded-4xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 bg-linear-to-r from-blue-50/60 to-cyan-50/40 px-6 py-4">
            <div className="flex items-center gap-2">
              <Star size={14} className="text-blue-600" />
              <p className="text-sm font-black text-slate-800">Tôi nên làm gì đầu tiên?</p>
            </div>
            <p className="mt-0.5 text-xs text-slate-500">
              Quy trình khuyến nghị để bắt đầu quản lý tài chính.
            </p>
          </div>

          <div className="p-5">
            <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-2 no-scrollbar">
              {QUICK_FLOW.map((step, index) => (
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
                    {index < QUICK_FLOW.length - 1 ? (
                      <div className="h-px flex-1 bg-slate-100" />
                    ) : null}
                  </div>
                  <div>
                    <p className="text-sm font-black text-slate-900">{step.title}</p>
                    <p className="mt-0.5 text-xs leading-5 text-slate-500">{step.desc}</p>
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
      ) : null}

      {!search ? (
        <section>
          <div className="mb-3 flex items-center gap-2 px-1">
            <div className="size-1.5 rounded-full bg-blue-600" />
            <p className="text-sm font-black text-slate-700">Bắt đầu trong 5 bước</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {ONBOARDING_STEPS.map((step) => {
              const Icon = step.icon;
              return (
                <Link
                  key={step.step}
                  href={step.href}
                  className={[
                    "group flex flex-col gap-4 rounded-4xl border p-5 transition-all hover:shadow-lg active:scale-[.98]",
                    step.light,
                    step.border,
                  ].join(" ")}
                >
                  <div className="flex items-center justify-between">
                    <div
                      className={[
                        "flex size-10 items-center justify-center rounded-2xl text-white shadow-md",
                        step.bg,
                        step.shadow,
                      ].join(" ")}
                    >
                      <Icon size={18} strokeWidth={2.5} />
                    </div>
                    <span
                      className={[
                        "flex size-6 items-center justify-center rounded-xl text-xs font-black text-white",
                        step.bg,
                      ].join(" ")}
                    >
                      {step.step}
                    </span>
                  </div>
                  <div>
                    <p className={["text-sm font-black", step.text].join(" ")}>{step.title}</p>
                    <p className="mt-1 text-xs leading-5 text-slate-600">{step.desc}</p>
                  </div>
                  <div className={["mt-auto flex items-center gap-1 text-[11px] font-black", step.text].join(" ")}>
                    {step.cta}
                    <ArrowRight size={11} className="transition-transform group-hover:translate-x-0.5" />
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      ) : null}

      {!search ? (
        <section className="overflow-hidden rounded-4xl border border-emerald-200 bg-white shadow-sm">
          <div className="border-b border-emerald-100 bg-linear-to-r from-emerald-50/60 to-white px-6 py-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={14} className="text-emerald-600" />
                  <p className="text-sm font-black text-slate-800">Danh sách kiểm tra thiết lập</p>
                </div>
                <p className="mt-0.5 text-xs text-slate-500">
                  Đồng bộ với tiến độ thiết lập ban đầu trên toàn bộ MyFinance.
                </p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-black text-emerald-600">
                  {checkCount}/{checklistTotal}
                </p>
                <p className="text-xs text-slate-400">hoàn thành</p>
              </div>
            </div>

            <div className="mt-3 h-2 overflow-hidden rounded-full bg-emerald-100">
              <div
                className="h-full rounded-full bg-linear-to-r from-emerald-500 to-emerald-400 transition-all duration-700"
                style={{ width: `${checkPct}%` }}
              />
            </div>
            {isFullyOnboarded ? (
              <p className="mt-1.5 text-xs font-bold text-emerald-600">
                Xuất sắc! Bạn đã thiết lập xong MyFinance.
              </p>
            ) : null}
          </div>

          <div className="divide-y divide-slate-50 p-2">
            {CHECKLIST_ITEMS.map((item) => {
              const done = Boolean(checklist[item.id]);
              return (
                <div
                  key={item.id}
                  className="flex items-center gap-4 rounded-2xl px-4 py-3.5 transition-colors hover:bg-slate-50"
                >
                  <button
                    type="button"
                    onClick={() => toggleCheck(item.id)}
                    aria-label={done ? `Đánh dấu chưa hoàn thành: ${item.label}` : `Đánh dấu hoàn thành: ${item.label}`}
                    className="shrink-0 transition-all active:scale-90"
                  >
                    {done ? (
                      <CheckCircle2 size={22} className="text-emerald-500" />
                    ) : (
                      <Circle size={22} className="text-slate-300" />
                    )}
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className={["text-sm font-bold", done ? "text-slate-400 line-through" : "text-slate-800"].join(" ")}>
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
      ) : null}

      <section>
        <div className="mb-3 flex items-center gap-2 px-1">
          <BookOpen size={14} className="text-blue-600" />
          <p className="text-sm font-black text-slate-700">Hướng dẫn từng tính năng</p>
          {search ? (
            <span className="ml-auto rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-black text-blue-700">
              {filteredGuides.length} / {FEATURE_GUIDES.length}
            </span>
          ) : null}
        </div>

        {filteredGuides.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-4xl border border-dashed border-slate-200 py-16 text-center">
            <Search size={32} className="text-slate-300" />
            <p className="mt-3 text-sm font-bold text-slate-400">Không tìm thấy hướng dẫn phù hợp</p>
            <button
              type="button"
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
                    "overflow-hidden rounded-4xl border transition-all duration-200",
                    open ? `${guide.accentBorder} shadow-md` : "border-slate-200",
                  ].join(" ")}
                >
                  <button
                    type="button"
                    onClick={() => setActiveGuide(open ? null : guide.id)}
                    className="flex w-full items-center gap-4 px-6 py-4 text-left transition-colors hover:bg-slate-50"
                  >
                    <div className={["flex size-10 shrink-0 items-center justify-center rounded-2xl", guide.accentIcon].join(" ")}>
                      <Icon size={18} strokeWidth={2} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-black text-slate-900">{guide.title}</p>
                      <p className="mt-0.5 line-clamp-1 text-xs text-slate-500">{guide.purpose}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Link
                        href={guide.href}
                        onClick={(event) => event.stopPropagation()}
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

                  {open ? (
                    <div className="border-t border-slate-100 px-6 pb-6 pt-5">
                      <div className="grid gap-5 lg:grid-cols-2">
                        <div className="space-y-4">
                          <div>
                            <p className="mb-1.5 text-[11px] font-black uppercase tracking-wide text-slate-400">Mục đích</p>
                            <p className="text-sm leading-6 text-slate-700">{guide.purpose}</p>
                          </div>
                          <div>
                            <p className="mb-1.5 text-[11px] font-black uppercase tracking-wide text-slate-400">Khi nào sử dụng</p>
                            <p className="text-sm leading-6 text-slate-700">{guide.when}</p>
                          </div>
                          <div>
                            <p className="mb-2 text-[11px] font-black uppercase tracking-wide text-slate-400">Cách sử dụng</p>
                            <ol className="space-y-2">
                              {guide.howTo.map((step, index) => (
                                <li key={`${guide.id}-step-${index}`} className="flex items-start gap-2.5">
                                  <span className={["mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-lg text-[10px] font-black text-white", guide.accentBg].join(" ")}>
                                    {index + 1}
                                  </span>
                                  <span className="text-sm leading-6 text-slate-700">{step}</span>
                                </li>
                              ))}
                            </ol>
                          </div>
                        </div>

                        <div className="space-y-4">
                          <div className={["rounded-2xl border p-4", guide.accentLight, guide.accentBorder].join(" ")}>
                            <p className={["mb-2 text-[11px] font-black uppercase tracking-wide", guide.accentText].join(" ")}>
                              Ví dụ thực tế
                            </p>
                            <p className="text-sm leading-6 text-slate-700">{guide.example}</p>
                          </div>
                          <div>
                            <p className="mb-2 flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wide text-slate-400">
                              <Lightbulb size={11} />
                              Mẹo tối ưu
                            </p>
                            <ul className="space-y-2">
                              {guide.tips.map((tip, index) => (
                                <li key={`${guide.id}-tip-${index}`} className="flex items-start gap-2.5">
                                  <Star size={12} className={["mt-1 shrink-0", guide.accentText].join(" ")} />
                                  <span className="text-sm leading-6 text-slate-700">{tip}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
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
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {!search ? (
        <section className="overflow-hidden rounded-4xl border border-indigo-200 bg-white shadow-sm">
          <div className="border-b border-indigo-100 bg-linear-to-r from-indigo-50/60 to-white px-6 py-4">
            <div className="flex items-center gap-2">
              <Lightbulb size={14} className="text-indigo-600" />
              <p className="text-sm font-black text-slate-800">Thuật ngữ tài chính</p>
            </div>
            <p className="mt-0.5 text-xs text-slate-500">
              Các chỉ số dưới đây dùng cùng ngữ nghĩa với các trang tài chính hiện tại.
            </p>
          </div>

          <div className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-3">
            {GLOSSARY_ITEMS.map(({ term, formula, color, desc }) => (
              <div
                key={term}
                className={[
                  "rounded-2xl border p-4",
                  `border-${color}-200`,
                  `bg-${color}-50/50`,
                ].join(" ")}
              >
                <p className={["text-sm font-black", `text-${color}-700`].join(" ")}>{term}</p>
                <div className={["mt-2 rounded-xl px-3 py-1.5", `bg-${color}-100`].join(" ")}>
                  <p className={["font-mono text-[11px] font-bold", `text-${color}-700`].join(" ")}>{formula}</p>
                </div>
                <p className="mt-2 text-xs leading-5 text-slate-600">{desc}</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section>
        <div className="mb-3 flex items-center gap-2 px-1">
          <div className="size-1.5 rounded-full bg-amber-500" />
          <p className="text-sm font-black text-slate-700">Câu hỏi thường gặp</p>
          {search ? (
            <span className="ml-auto rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-black text-amber-700">
              {filteredFaq.length} / {FAQ_ITEMS.length}
            </span>
          ) : null}
        </div>

        {filteredFaq.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-4xl border border-dashed border-slate-200 py-12 text-center">
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
                    "overflow-hidden rounded-4xl border transition-all",
                    open ? "border-amber-300 shadow-sm" : "border-slate-200 hover:border-amber-200",
                  ].join(" ")}
                >
                  <button
                    type="button"
                    onClick={() => setOpenFaq(open ? null : faq.id)}
                    className="flex w-full items-center gap-3 px-6 py-4 text-left transition-colors hover:bg-amber-50/40"
                  >
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-xs font-black text-amber-700">?</div>
                    <p className="flex-1 text-sm font-bold text-slate-800">{faq.q}</p>
                    {open ? (
                      <ChevronUp size={16} className="shrink-0 text-amber-500" />
                    ) : (
                      <ChevronDown size={16} className="shrink-0 text-slate-400" />
                    )}
                  </button>

                  {open ? (
                    <div className="border-t border-amber-100 bg-amber-50/30 px-6 pb-5 pt-4">
                      <p className="text-sm leading-6 text-slate-700">{faq.a}</p>
                      {faq.formula ? (
                        <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-100/60 px-4 py-3">
                          <p className="text-[10px] font-black uppercase tracking-wide text-amber-600">Công thức</p>
                          <p className="mt-1 font-mono text-sm font-bold text-amber-800">{faq.formula}</p>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {!search ? (
        <section className="overflow-hidden rounded-4xl border border-blue-200 bg-linear-to-br from-blue-600 via-blue-700 to-cyan-600 shadow-lg shadow-blue-200/60">
          <div className="px-6 py-7 text-center sm:px-10">
            <p className="text-[11px] font-black uppercase tracking-widest text-blue-200">Sẵn sàng bắt đầu?</p>
            <h2 className="mt-2 text-2xl font-black text-white">Bắt đầu quản lý tài chính ngay hôm nay</h2>
            <p className="mt-2 text-sm text-blue-200">
              Ghi dữ liệu đúng phân hệ trước, sau đó dùng Tổng quan và Báo cáo để đọc một bức tranh nhất quán.
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
                Xem Phân tích AI
              </Link>
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}
