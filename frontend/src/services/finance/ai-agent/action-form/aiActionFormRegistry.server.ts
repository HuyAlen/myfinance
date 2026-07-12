import type { AIActionFormSchema } from "./aiActionFormTypes";

const schemas: Record<string, AIActionFormSchema> = {
  create_budget: {
    toolName: "create_budget",
    title: "Tạo ngân sách",
    description: "Thiết lập hạn mức chi tiêu theo danh mục và tháng.",
    submitLabel: "Kiểm tra",
    fields: [
      {
        name: "categoryId",
        label: "Danh mục",
        type: "entity-select",
        entity: "expense_category",
        required: true,
      },
      {
        name: "month",
        label: "Tháng",
        type: "month",
        required: true,
      },
      {
        name: "limitAmount",
        label: "Hạn mức",
        type: "currency",
        required: true,
        min: 1,
        placeholder: "5.000.000",
      },
    ],
  },
  update_budget: {
    toolName: "update_budget",
    title: "Cập nhật ngân sách",
    description: "Chọn ngân sách cần sửa và nhập hạn mức mới.",
    submitLabel: "Kiểm tra thay đổi",
    fields: [
      {
        name: "budgetId",
        label: "Ngân sách",
        type: "entity-select",
        entity: "budget",
        required: true,
      },
      {
        name: "limitAmount",
        label: "Hạn mức mới",
        type: "currency",
        required: true,
        min: 1,
        placeholder: "5.000.000",
      },
    ],
  },
  create_goal: {
    toolName: "create_goal",
    title: "Tạo mục tiêu tài chính",
    description: "Khai báo tên mục tiêu và số tiền cần đạt.",
    submitLabel: "Kiểm tra",
    fields: [
      {
        name: "name",
        label: "Tên mục tiêu",
        type: "text",
        required: true,
        maxLength: 120,
        placeholder: "Ví dụ: Quỹ khẩn cấp",
      },
      {
        name: "targetAmount",
        label: "Số tiền mục tiêu",
        type: "currency",
        required: true,
        min: 1,
        placeholder: "100.000.000",
      },
      {
        name: "currentAmount",
        label: "Đã tích lũy",
        type: "currency",
        required: false,
        min: 0,
        defaultValue: 0,
        placeholder: "0",
      },
    ],
  },
};

export function getAIActionFormSchema(toolName: string) {
  return schemas[toolName];
}

export function listAIActionFormSchemas() {
  return Object.values(schemas);
}

export function supportsAIActionForm(toolName: string) {
  return Boolean(schemas[toolName]);
}
