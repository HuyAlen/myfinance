// DB-SSOT-1: maintained against /supabase/schema.sql.
// Column names intentionally match PostgreSQL exactly, including quoted
// camelCase identifiers inherited from the original MyFinance schema.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

type WalletType = "cash" | "bank" | "ewallet" | "investment";
type CategoryType = "income" | "expense";
type TransactionDbType =
  | "income"
  | "expense"
  | "transfer"
  | "saving"
  | "investment";
type RecurrenceFreq = "daily" | "weekly" | "monthly" | "yearly";
type InvestmentType = "stock" | "crypto" | "fund" | "gold" | "other";
type SavingType =
  | "savings_account"
  | "term_deposit"
  | "certificate"
  | "emergency_fund";
type SavingTransactionType = "deposit" | "withdraw" | "interest" | "settlement";
type ForexAccountStatus = "active" | "inactive" | "archived";
type ForexCashTransactionType = "deposit" | "withdrawal";
type HouseholdRole = "owner" | "member" | "viewer";
type HouseholdInviteRole = "member" | "viewer";
type HouseholdInviteStatus = "pending" | "accepted" | "revoked" | "expired";
type AIProvider = "openai" | "local";
type AIConnectionStatus = "not_tested" | "connected" | "invalid" | "error";
type AIMessageRole = "user" | "assistant";
type AIMessageProvider = "local" | "openai" | "fallback";
type AIMessageStatus = "pending" | "streaming" | "completed" | "stopped" | "error";
type AIPendingActionStatus =
  | "pending"
  | "confirmed"
  | "executing"
  | "completed"
  | "cancelled"
  | "expired"
  | "failed";

type HouseholdRow = {
  id: string;
  owner_user_id: string;
  name: string;
  created_at: string;
  updated_at: string;
};
type HouseholdInsert = {
  id?: string;
  owner_user_id: string;
  name?: string;
  created_at?: string;
  updated_at?: string;
};
type HouseholdUpdate = Partial<HouseholdInsert>;
type HouseholdMemberRow = {
  household_id: string;
  user_id: string;
  role: HouseholdRole;
  joined_at: string;
};
type HouseholdMemberInsert = {
  household_id: string;
  user_id: string;
  role: HouseholdRole;
  joined_at?: string;
};
type HouseholdMemberUpdate = Partial<HouseholdMemberInsert>;
type HouseholdInviteRow = {
  id: string;
  household_id: string;
  email: string;
  role: HouseholdInviteRole;
  status: HouseholdInviteStatus;
  invited_by: string;
  accepted_by: string | null;
  accepted_at: string | null;
  expires_at: string;
  created_at: string;
  updated_at: string;
};
type HouseholdInviteInsert = {
  id?: string;
  household_id: string;
  email: string;
  role?: HouseholdInviteRole;
  status?: HouseholdInviteStatus;
  invited_by: string;
  accepted_by?: string | null;
  accepted_at?: string | null;
  expires_at?: string;
  created_at?: string;
  updated_at?: string;
};
type HouseholdInviteUpdate = Partial<HouseholdInviteInsert>;
type WalletRow = {
  id: string;
  user_id: string;
  name: string;
  type: WalletType;
  balance: number;
  currency: string;
  created_at: string;
  updated_at: string;
};
type WalletInsert = {
  id: string;
  user_id: string;
  name: string;
  type?: WalletType;
  balance?: number;
  currency?: string;
  created_at?: string;
  updated_at?: string;
};
type WalletUpdate = Partial<WalletInsert>;

type CategoryRow = {
  id: string;
  user_id: string;
  name: string;
  type: CategoryType;
  planning_group: "income" | "fixed" | "variable" | "saving" | "investment" | null;
  financial_group: "income" | "needs" | "wants" | "saving" | null;
  is_recurring: boolean;
  recurrence: string | null;
  default_amount: number | null;
  default_wallet_id: string | null;
  next_run_date: string | null;
  created_at: string;
  updated_at: string;
};
type CategoryInsert = {
  id: string;
  user_id: string;
  name: string;
  type: CategoryType;
  planning_group?: CategoryRow["planning_group"];
  financial_group?: CategoryRow["financial_group"];
  is_recurring?: boolean;
  recurrence?: string | null;
  default_amount?: number | null;
  default_wallet_id?: string | null;
  next_run_date?: string | null;
  created_at?: string;
  updated_at?: string;
};
type CategoryUpdate = Partial<CategoryInsert>;

type TransactionRow = {
  id: string;
  user_id: string;
  type: TransactionDbType;
  amount: number;
  categoryId: string;
  walletId: string;
  note: string;
  date: string;
  transferToWalletId: string | null;
  isRecurring: boolean;
  recurrence: RecurrenceFreq | null;
  nextRunDate: string | null;
  transfer_fee: number | null;
  exchange_rate: number | null;
  transfer_reference: string | null;
  transfer_reference_type: string | null;
  source_type: string | null;
  destination_type: string | null;
  created_at: string;
  updated_at: string;
};
type TransactionInsert = {
  id: string;
  user_id: string;
  type: TransactionDbType;
  amount: number;
  categoryId?: string;
  walletId: string;
  note?: string;
  date: string;
  transferToWalletId?: string | null;
  isRecurring?: boolean;
  recurrence?: RecurrenceFreq | null;
  nextRunDate?: string | null;
  transfer_fee?: number | null;
  exchange_rate?: number | null;
  transfer_reference?: string | null;
  transfer_reference_type?: string | null;
  source_type?: string | null;
  destination_type?: string | null;
  created_at?: string;
  updated_at?: string;
};
type TransactionUpdate = Partial<TransactionInsert>;

type DebtRow = {
  id: string;
  user_id: string;
  name: string;
  totalAmount: number;
  remainingAmount: number;
  interestRate: number | null;
  minimumPayment: number | null;
  dueDate: string | null;
  loanTermMonths: number | null;
  created_at: string;
  updated_at: string;
};
type DebtInsert = {
  id: string;
  user_id: string;
  name: string;
  totalAmount: number;
  remainingAmount?: number;
  interestRate?: number | null;
  minimumPayment?: number | null;
  dueDate?: string | null;
  loanTermMonths?: number | null;
  created_at?: string;
  updated_at?: string;
};
type DebtUpdate = Partial<DebtInsert>;

type GoalRow = {
  id: string;
  user_id: string;
  name: string;
  targetAmount: number;
  currentAmount: number;
  saving_category_ids: string[];
  created_at: string;
  updated_at: string;
};
type GoalInsert = {
  id: string;
  user_id: string;
  name: string;
  targetAmount: number;
  currentAmount?: number;
  saving_category_ids?: string[];
  created_at?: string;
  updated_at?: string;
};
type GoalUpdate = Partial<GoalInsert>;

type BudgetRow = {
  id: string;
  user_id: string;
  categoryId: string;
  month: string;
  limitAmount: number;
  rolloverAmount: number;
  warningThreshold: number | null;
  criticalThreshold: number | null;
  created_at: string;
  updated_at: string;
};
type BudgetInsert = {
  id: string;
  user_id: string;
  categoryId: string;
  month: string;
  limitAmount: number;
  rolloverAmount?: number;
  warningThreshold?: number | null;
  criticalThreshold?: number | null;
  created_at?: string;
  updated_at?: string;
};
type BudgetUpdate = Partial<BudgetInsert>;

type InvestmentRow = {
  id: string;
  user_id: string;
  name: string;
  type: InvestmentType;
  symbol: string | null;
  investedAmount: number;
  currentValue: number;
  purchaseDate: string | null;
  notes: string | null;
  quantity: number | null;
  averageCost: number | null;
  currentPrice: number | null;
  created_at: string;
  updated_at: string;
};
type InvestmentInsert = {
  id: string;
  user_id: string;
  name: string;
  type: InvestmentType;
  symbol?: string | null;
  investedAmount: number;
  currentValue?: number;
  purchaseDate?: string | null;
  notes?: string | null;
  quantity?: number | null;
  averageCost?: number | null;
  currentPrice?: number | null;
  created_at?: string;
  updated_at?: string;
};
type InvestmentUpdate = Partial<InvestmentInsert>;

type SavingRow = {
  id: string;
  user_id: string | null;
  name: string;
  type: SavingType;
  balance: number;
  wallet_id: string | null;
  interest_rate: number | null;
  maturity_date: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};
type SavingInsert = {
  id?: string;
  user_id?: string | null;
  name: string;
  type: SavingType;
  balance?: number;
  wallet_id?: string | null;
  interest_rate?: number | null;
  maturity_date?: string | null;
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
};
type SavingUpdate = Partial<SavingInsert>;

type SavingTransactionRow = {
  id: string;
  saving_id: string;
  user_id: string | null;
  type: SavingTransactionType;
  amount: number;
  transaction_date: string;
  note: string | null;
  wallet_id: string | null;
  created_at: string;
};
type SavingTransactionInsert = {
  id?: string;
  saving_id: string;
  user_id?: string | null;
  type: SavingTransactionType;
  amount: number;
  transaction_date?: string;
  note?: string | null;
  wallet_id?: string | null;
  created_at?: string;
};
type SavingTransactionUpdate = Partial<SavingTransactionInsert>;

type ForexAccountRow = {
  id: string;
  user_id: string;
  name: string;
  broker: string;
  account_number: string | null;
  currency: string;
  status: ForexAccountStatus;
  opened_at: string | null;
  notes: string | null;
  current_equity: number | null;
  created_at: string;
  updated_at: string;
};
type ForexAccountInsert = {
  id: string;
  user_id: string;
  name: string;
  broker: string;
  account_number?: string | null;
  currency?: string;
  status?: ForexAccountStatus;
  opened_at?: string | null;
  notes?: string | null;
  current_equity?: number | null;
  created_at?: string;
  updated_at?: string;
};
type ForexAccountUpdate = Partial<ForexAccountInsert>;

type ForexCashTransactionRow = {
  id: string;
  user_id: string;
  forex_account_id: string;
  wallet_id: string | null;
  type: ForexCashTransactionType;
  amount: number;
  currency: string;
  fee: number;
  transaction_date: string;
  transaction_time: string;
  transacted_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};
type ForexCashTransactionInsert = {
  id: string;
  user_id: string;
  forex_account_id: string;
  wallet_id?: string | null;
  type: ForexCashTransactionType;
  amount: number;
  currency?: string;
  fee?: number;
  transaction_date: string;
  transaction_time?: string;
  transacted_at?: string | null;
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
};
type ForexCashTransactionUpdate = Partial<ForexCashTransactionInsert>;

type NetWorthSnapshotRow = {
  id: string;
  user_id: string;
  snapshot_month: string;
  cash_and_wallets: number;
  savings: number;
  investments: number;
  forex: number;
  total_assets: number;
  total_debt: number;
  net_worth: number;
  captured_at: string;
  created_at: string;
  updated_at: string;
};
type NetWorthSnapshotInsert = {
  id?: string;
  user_id: string;
  snapshot_month: string;
  cash_and_wallets?: number;
  savings?: number;
  investments?: number;
  forex?: number;
  total_assets?: number;
  total_debt?: number;
  net_worth?: number;
  captured_at?: string;
  created_at?: string;
  updated_at?: string;
};
type NetWorthSnapshotUpdate = Partial<NetWorthSnapshotInsert>;

type AIUserSettingsRow = {
  id: string;
  user_id: string;
  provider: AIProvider;
  api_key: string | null;
  encrypted_api_key: string | null;
  api_key_iv: string | null;
  api_key_auth_tag: string | null;
  api_key_hint: string | null;
  model: string;
  temperature: number;
  max_tokens: number;
  fallback_local: boolean;
  no_fabrication: boolean;
  send_finance_context: boolean;
  send_rule_insights: boolean;
  connection_status: AIConnectionStatus;
  last_tested_at: string | null;
  last_test_latency_ms: number | null;
  last_test_error: string | null;
  created_at: string;
  updated_at: string;
};
type AIUserSettingsInsert = {
  id?: string;
  user_id: string;
  provider?: AIProvider;
  api_key?: string | null;
  encrypted_api_key?: string | null;
  api_key_iv?: string | null;
  api_key_auth_tag?: string | null;
  api_key_hint?: string | null;
  model?: string;
  temperature?: number;
  max_tokens?: number;
  fallback_local?: boolean;
  no_fabrication?: boolean;
  send_finance_context?: boolean;
  send_rule_insights?: boolean;
  connection_status?: AIConnectionStatus;
  last_tested_at?: string | null;
  last_test_latency_ms?: number | null;
  last_test_error?: string | null;
  created_at?: string;
  updated_at?: string;
};
type AIUserSettingsUpdate = Partial<AIUserSettingsInsert>;

type AIConversationRow = {
  id: string;
  user_id: string;
  title: string;
  is_pinned: boolean;
  created_at: string;
  updated_at: string;
  last_message_at: string;
};
type AIConversationInsert = {
  id?: string;
  user_id: string;
  title?: string;
  is_pinned?: boolean;
  created_at?: string;
  updated_at?: string;
  last_message_at?: string;
};
type AIConversationUpdate = Partial<AIConversationInsert>;

type AIMessageRow = {
  id: string;
  conversation_id: string;
  role: AIMessageRole;
  content: string;
  provider: AIMessageProvider | null;
  model: string | null;
  confidence: number | null;
  status: AIMessageStatus;
  metadata: Json | null;
  created_at: string;
};
type AIMessageInsert = {
  id?: string;
  conversation_id: string;
  role: AIMessageRole;
  content: string;
  provider?: AIMessageProvider | null;
  model?: string | null;
  confidence?: number | null;
  status?: AIMessageStatus;
  metadata?: Json | null;
  created_at?: string;
};
type AIMessageUpdate = Partial<AIMessageInsert>;

type AIPendingActionRow = {
  id: string;
  user_id: string;
  conversation_id: string | null;
  tool_name: string;
  arguments: Json;
  preview: Json;
  status: AIPendingActionStatus;
  result: Json | null;
  error_message: string | null;
  old_value: Json | null;
  new_value: Json | null;
  idempotency_key: string | null;
  expires_at: string;
  confirmed_at: string | null;
  executed_at: string | null;
  created_at: string;
  updated_at: string;
};
type AIPendingActionInsert = {
  id?: string;
  user_id: string;
  conversation_id?: string | null;
  tool_name: string;
  arguments?: Json;
  preview?: Json;
  status?: AIPendingActionStatus;
  result?: Json | null;
  error_message?: string | null;
  old_value?: Json | null;
  new_value?: Json | null;
  idempotency_key?: string | null;
  expires_at: string;
  confirmed_at?: string | null;
  executed_at?: string | null;
  created_at?: string;
  updated_at?: string;
};
type AIPendingActionUpdate = Partial<AIPendingActionInsert>;

type AIActionAuditLogRow = {
  id: string;
  user_id: string;
  pending_action_id: string;
  conversation_id: string | null;
  tool_name: string;
  status: string;
  old_value: Json | null;
  new_value: Json | null;
  result: Json | null;
  error_message: string | null;
  created_at: string;
};
type AIActionAuditLogInsert = {
  id?: string;
  user_id: string;
  pending_action_id: string;
  conversation_id?: string | null;
  tool_name: string;
  status: string;
  old_value?: Json | null;
  new_value?: Json | null;
  result?: Json | null;
  error_message?: string | null;
  created_at?: string;
};
type AIActionAuditLogUpdate = Partial<AIActionAuditLogInsert>;

type AIUsageLogRow = {
  id: string;
  user_id: string;
  conversation_id: string | null;
  provider: string;
  model: string | null;
  request_type: string;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  latency_ms: number | null;
  status: string;
  error_code: string | null;
  created_at: string;
};
type AIUsageLogInsert = {
  id?: string;
  user_id: string;
  conversation_id?: string | null;
  provider: string;
  model?: string | null;
  request_type?: string;
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
  latency_ms?: number | null;
  status?: string;
  error_code?: string | null;
  created_at?: string;
};
type AIUsageLogUpdate = Partial<AIUsageLogInsert>;

export type Database = {
  public: {
    Tables: {
      households: { Row: HouseholdRow; Insert: HouseholdInsert; Update: HouseholdUpdate; Relationships: [] };
      household_members: { Row: HouseholdMemberRow; Insert: HouseholdMemberInsert; Update: HouseholdMemberUpdate; Relationships: [] };
      household_invites: { Row: HouseholdInviteRow; Insert: HouseholdInviteInsert; Update: HouseholdInviteUpdate; Relationships: [] };
      wallets: { Row: WalletRow; Insert: WalletInsert; Update: WalletUpdate; Relationships: [] };
      categories: {
        Row: CategoryRow;
        Insert: CategoryInsert;
        Update: CategoryUpdate;
        Relationships: [{ foreignKeyName: "categories_default_wallet_fk"; columns: ["default_wallet_id"]; isOneToOne: false; referencedRelation: "wallets"; referencedColumns: ["id"] }];
      };
      transactions: {
        Row: TransactionRow;
        Insert: TransactionInsert;
        Update: TransactionUpdate;
        Relationships: [
          { foreignKeyName: "transactions_wallet_id_fkey"; columns: ["user_id", "walletId"]; isOneToOne: false; referencedRelation: "wallets"; referencedColumns: ["user_id", "id"] },
          { foreignKeyName: "transactions_transfer_to_wallet_id_fkey"; columns: ["user_id", "transferToWalletId"]; isOneToOne: false; referencedRelation: "wallets"; referencedColumns: ["user_id", "id"] }
        ];
      };
      debts: { Row: DebtRow; Insert: DebtInsert; Update: DebtUpdate; Relationships: [] };
      goals: { Row: GoalRow; Insert: GoalInsert; Update: GoalUpdate; Relationships: [] };
      budgets: {
        Row: BudgetRow;
        Insert: BudgetInsert;
        Update: BudgetUpdate;
        Relationships: [
          {
            foreignKeyName: "budgets_category_owner_fk";
            columns: ["user_id", "categoryId"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["user_id", "id"];
          }
        ];
      };
      investments: { Row: InvestmentRow; Insert: InvestmentInsert; Update: InvestmentUpdate; Relationships: [] };
      savings: {
        Row: SavingRow;
        Insert: SavingInsert;
        Update: SavingUpdate;
        Relationships: [{ foreignKeyName: "savings_wallet_id_fkey"; columns: ["wallet_id"]; isOneToOne: false; referencedRelation: "wallets"; referencedColumns: ["id"] }];
      };
      saving_transactions: {
        Row: SavingTransactionRow;
        Insert: SavingTransactionInsert;
        Update: SavingTransactionUpdate;
        Relationships: [
          { foreignKeyName: "saving_transactions_saving_id_fkey"; columns: ["saving_id"]; isOneToOne: false; referencedRelation: "savings"; referencedColumns: ["id"] },
          { foreignKeyName: "saving_transactions_wallet_id_fkey"; columns: ["wallet_id"]; isOneToOne: false; referencedRelation: "wallets"; referencedColumns: ["id"] }
        ];
      };
      forex_accounts: { Row: ForexAccountRow; Insert: ForexAccountInsert; Update: ForexAccountUpdate; Relationships: [] };
      forex_cash_transactions: {
        Row: ForexCashTransactionRow;
        Insert: ForexCashTransactionInsert;
        Update: ForexCashTransactionUpdate;
        Relationships: [
          { foreignKeyName: "forex_cash_transactions_forex_account_id_fkey"; columns: ["forex_account_id"]; isOneToOne: false; referencedRelation: "forex_accounts"; referencedColumns: ["id"] },
          { foreignKeyName: "forex_cash_transactions_wallet_id_fkey"; columns: ["wallet_id"]; isOneToOne: false; referencedRelation: "wallets"; referencedColumns: ["id"] }
        ];
      };
      net_worth_snapshots: {
        Row: NetWorthSnapshotRow;
        Insert: NetWorthSnapshotInsert;
        Update: NetWorthSnapshotUpdate;
        Relationships: [];
      };
      ai_user_settings: { Row: AIUserSettingsRow; Insert: AIUserSettingsInsert; Update: AIUserSettingsUpdate; Relationships: [] };
      ai_conversations: { Row: AIConversationRow; Insert: AIConversationInsert; Update: AIConversationUpdate; Relationships: [] };
      ai_messages: {
        Row: AIMessageRow;
        Insert: AIMessageInsert;
        Update: AIMessageUpdate;
        Relationships: [{ foreignKeyName: "ai_messages_conversation_id_fkey"; columns: ["conversation_id"]; isOneToOne: false; referencedRelation: "ai_conversations"; referencedColumns: ["id"] }];
      };
      ai_pending_actions: {
        Row: AIPendingActionRow;
        Insert: AIPendingActionInsert;
        Update: AIPendingActionUpdate;
        Relationships: [{ foreignKeyName: "ai_pending_actions_conversation_id_fkey"; columns: ["conversation_id"]; isOneToOne: false; referencedRelation: "ai_conversations"; referencedColumns: ["id"] }];
      };
      ai_action_audit_logs: {
        Row: AIActionAuditLogRow;
        Insert: AIActionAuditLogInsert;
        Update: AIActionAuditLogUpdate;
        Relationships: [
          { foreignKeyName: "ai_action_audit_logs_pending_action_id_fkey"; columns: ["pending_action_id"]; isOneToOne: false; referencedRelation: "ai_pending_actions"; referencedColumns: ["id"] },
          { foreignKeyName: "ai_action_audit_logs_conversation_id_fkey"; columns: ["conversation_id"]; isOneToOne: false; referencedRelation: "ai_conversations"; referencedColumns: ["id"] }
        ];
      };
      ai_usage_logs: {
        Row: AIUsageLogRow;
        Insert: AIUsageLogInsert;
        Update: AIUsageLogUpdate;
        Relationships: [{ foreignKeyName: "ai_usage_logs_conversation_id_fkey"; columns: ["conversation_id"]; isOneToOne: false; referencedRelation: "ai_conversations"; referencedColumns: ["id"] }];
      };
    };
    Views: Record<string, never>;
    Functions: {
      get_finance_scope_owner_user_id: { Args: Record<string, never>; Returns: string };
      get_current_household_context: { Args: Record<string, never>; Returns: Json };
      create_household_invite: { Args: { p_email: string; p_role?: HouseholdInviteRole }; Returns: Json };
      accept_current_household_invite: { Args: Record<string, never>; Returns: Json };
      revoke_household_invite: { Args: { p_invite_id: string }; Returns: Json };
      remove_household_member: { Args: { p_user_id: string }; Returns: Json };
      set_household_member_role: { Args: { p_user_id: string; p_role: HouseholdInviteRole }; Returns: Json };
      rename_current_household: { Args: { p_name: string }; Returns: Json };
      create_finance_transaction: {
        Args: {
          p_id: string; p_type: string; p_amount: number; p_category_id: string; p_wallet_id: string; p_note: string; p_date: string; p_effect_wallet_id_1: string; p_effect_delta_1: number;
          p_transfer_to_wallet_id?: string | null; p_is_recurring?: boolean; p_recurrence?: string | null; p_next_run_date?: string | null; p_transfer_fee?: number | null; p_exchange_rate?: number | null; p_transfer_reference?: string | null; p_transfer_reference_type?: string | null; p_source_type?: string | null; p_destination_type?: string | null; p_effect_wallet_id_2?: string | null; p_effect_delta_2?: number | null;
        };
        Returns: TransactionRow;
      };
      update_finance_transaction: {
        Args: {
          p_id: string; p_type: string; p_amount: number; p_category_id: string; p_wallet_id: string; p_note: string; p_date: string; p_expected_amount: number; p_expected_wallet_id: string; p_expected_type: string; p_old_effect_wallet_id_1: string; p_old_effect_delta_1: number; p_new_effect_wallet_id_1: string; p_new_effect_delta_1: number;
          p_expected_transfer_to_wallet_id?: string | null; p_transfer_to_wallet_id?: string | null; p_is_recurring?: boolean; p_recurrence?: string | null; p_next_run_date?: string | null; p_transfer_fee?: number | null; p_exchange_rate?: number | null; p_transfer_reference?: string | null; p_transfer_reference_type?: string | null; p_source_type?: string | null; p_destination_type?: string | null; p_old_effect_wallet_id_2?: string | null; p_old_effect_delta_2?: number | null; p_new_effect_wallet_id_2?: string | null; p_new_effect_delta_2?: number | null;
        };
        Returns: TransactionRow;
      };
      delete_finance_transaction: {
        Args: { p_id: string; p_expected_amount: number; p_expected_wallet_id: string; p_expected_type: string; p_expected_transfer_to_wallet_id?: string | null; p_effect_wallet_id_1?: string | null; p_effect_delta_1?: number | null; p_effect_wallet_id_2?: string | null; p_effect_delta_2?: number | null };
        Returns: undefined;
      };
      delete_wallet_atomic: { Args: { p_wallet_id: string }; Returns: undefined };
      delete_category_atomic: { Args: { p_category_id: string }; Returns: undefined };
      create_saving_account: {
        Args: { p_saving_id: string; p_name: string; p_type: string; p_balance: number; p_wallet_id: string; p_saving_transaction_id: string; p_transaction_date: string; p_interest_rate?: number | null; p_maturity_date?: string | null; p_notes?: string | null };
        Returns: { saving: SavingRow; wallet: WalletRow; saving_transaction: SavingTransactionRow }[];
      };
      create_saving_movement: {
        Args: { p_saving_id: string; p_wallet_id: string; p_type: string; p_amount: number; p_note: string; p_transaction_date: string; p_saving_transaction_id: string; p_finance_transaction_id: string };
        Returns: { saving: SavingRow; wallet: WalletRow; saving_transaction: SavingTransactionRow }[];
      };
      delete_saving_account: { Args: { p_saving_id: string }; Returns: string };
      create_forex_cash_transaction: {
        Args: { p_id: string; p_forex_account_id: string; p_wallet_id: string; p_type: string; p_amount: number; p_currency: string; p_fee: number; p_transaction_date: string; p_transaction_time: string; p_notes: string | null };
        Returns: ForexCashTransactionRow;
      };
      update_forex_cash_transaction: {
        Args: { p_id: string; p_forex_account_id: string; p_wallet_id: string; p_type: string; p_amount: number; p_currency: string; p_fee: number; p_transaction_date: string; p_transaction_time: string; p_notes: string | null };
        Returns: ForexCashTransactionRow;
      };
      delete_forex_cash_transaction: { Args: { p_id: string }; Returns: undefined };
      delete_forex_account_atomic: { Args: { p_account_id: string }; Returns: undefined };
      capture_current_net_worth_snapshot: { Args: { p_user_id: string }; Returns: undefined };
      clone_previous_month_budgets_atomic: { Args: { p_target_month: string }; Returns: Json };
      export_finance_backup: { Args: Record<PropertyKey, never>; Returns: Json };
      restore_finance_backup: { Args: { p_backup: Json }; Returns: Json };
      seed_finance_demo_data: { Args: { p_seed: Json }; Returns: boolean };
    };
    Enums: {
      wallet_type: WalletType;
      category_type: CategoryType;
      transaction_type: TransactionDbType;
      recurrence_freq: RecurrenceFreq;
      investment_type: InvestmentType;
    };
    CompositeTypes: Record<string, never>;
  };
};
