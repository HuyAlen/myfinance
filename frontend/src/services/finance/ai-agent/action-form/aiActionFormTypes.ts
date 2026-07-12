export type AIActionFormFieldType =
  | "text"
  | "currency"
  | "month"
  | "entity-select";

export type AIActionFormOption = {
  label: string;
  value: string;
  description?: string;
};

export type AIActionFormField = {
  name: string;
  label: string;
  type: AIActionFormFieldType;
  required: boolean;
  placeholder?: string;
  min?: number;
  maxLength?: number;
  defaultValue?: string | number;
  entity?: "expense_category" | "budget";
  options?: AIActionFormOption[];
};

export type AIActionFormSchema = {
  toolName: string;
  title: string;
  description: string;
  submitLabel: string;
  fields: AIActionFormField[];
};

export type AIActionFormMetadata = {
  id: string;
  toolName: string;
  schema: AIActionFormSchema;
  initialValues: Record<string, unknown>;
  missingFields: string[];
  source: "planner" | "manual" | "continuation";
};

export type AIActionFormPrepareRequest = {
  toolName: string;
  conversationId?: string;
  values: Record<string, unknown>;
};
