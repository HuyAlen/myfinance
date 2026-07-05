// Auto-maintained alongside supabase/schema.sql.
// Matches column names exactly as defined in the database (camelCase via quoted identifiers).
// Structure follows supabase-js v2 generator output — Views/Functions/Enums/CompositeTypes
// must be present for the generic type resolution to work correctly.

export type Database = {
  public: {
    Tables: {
      wallets: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          type: "cash" | "bank" | "ewallet" | "investment";
          balance: number;
        };
        Insert: {
          id: string;
          user_id: string;
          name: string;
          type: "cash" | "bank" | "ewallet" | "investment";
          balance?: number;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          type?: "cash" | "bank" | "ewallet" | "investment";
          balance?: number;
        };
        Relationships: [];
      };

      categories: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          type: "income" | "expense";
        };
        Insert: {
          id: string;
          user_id: string;
          name: string;
          type: "income" | "expense";
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          type?: "income" | "expense";
        };
        Relationships: [];
      };

      transactions: {
        Row: {
          id: string;
          user_id: string;
          type: "income" | "expense" | "transfer" | "saving" | "investment";
          amount: number;
          categoryId: string;
          walletId: string;
          note: string;
          date: string;
          transferToWalletId: string | null;
          isRecurring: boolean | null;
          recurrence: "daily" | "weekly" | "monthly" | "yearly" | null;
          nextRunDate: string | null;
        };
        Insert: {
          id: string;
          user_id: string;
          type: "income" | "expense" | "transfer" | "saving" | "investment";
          amount: number;
          categoryId: string;
          walletId: string;
          note?: string;
          date: string;
          transferToWalletId?: string | null;
          isRecurring?: boolean | null;
          recurrence?: "daily" | "weekly" | "monthly" | "yearly" | null;
          nextRunDate?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          type?: "income" | "expense" | "transfer" | "saving" | "investment";
          amount?: number;
          categoryId?: string;
          walletId?: string;
          note?: string;
          date?: string;
          transferToWalletId?: string | null;
          isRecurring?: boolean | null;
          recurrence?: "daily" | "weekly" | "monthly" | "yearly" | null;
          nextRunDate?: string | null;
        };
        Relationships: [];
      };

      debts: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          totalAmount: number;
          remainingAmount: number;
          interestRate: number | null;
          minimumPayment: number | null;
          dueDate: string | null;
          loanTermMonths: number | null;
        };
        Insert: {
          id: string;
          user_id: string;
          name: string;
          totalAmount: number;
          remainingAmount: number;
          interestRate?: number | null;
          minimumPayment?: number | null;
          dueDate?: string | null;
          loanTermMonths?: number | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          totalAmount?: number;
          remainingAmount?: number;
          interestRate?: number | null;
          minimumPayment?: number | null;
          dueDate?: string | null;
          loanTermMonths?: number | null;
        };
        Relationships: [];
      };

      goals: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          targetAmount: number;
          currentAmount: number;
        };
        Insert: {
          id: string;
          user_id: string;
          name: string;
          targetAmount: number;
          currentAmount?: number;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          targetAmount?: number;
          currentAmount?: number;
        };
        Relationships: [];
      };

      budgets: {
        Row: {
          id: string;
          user_id: string;
          categoryId: string;
          month: string;
          limitAmount: number;
          rolloverAmount: number | null;
          warningThreshold: number | null;
          criticalThreshold: number | null;
        };
        Insert: {
          id: string;
          user_id: string;
          categoryId: string;
          month: string;
          limitAmount: number;
          rolloverAmount?: number | null;
          warningThreshold?: number | null;
          criticalThreshold?: number | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          categoryId?: string;
          month?: string;
          limitAmount?: number;
          rolloverAmount?: number | null;
          warningThreshold?: number | null;
          criticalThreshold?: number | null;
        };
        Relationships: [];
      };

      ai_user_settings: {
        Row: {
          id: string;
          user_id: string;
          provider: "openai" | "local";
          api_key: string | null;
          model: string;
          temperature: number;
          max_tokens: number;
          fallback_local: boolean;
          no_fabrication: boolean;
          send_finance_context: boolean;
          send_rule_insights: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          provider?: "openai" | "local";
          api_key?: string | null;
          model?: string;
          temperature?: number;
          max_tokens?: number;
          fallback_local?: boolean;
          no_fabrication?: boolean;
          send_finance_context?: boolean;
          send_rule_insights?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          provider?: "openai" | "local";
          api_key?: string | null;
          model?: string;
          temperature?: number;
          max_tokens?: number;
          fallback_local?: boolean;
          no_fabrication?: boolean;
          send_finance_context?: boolean;
          send_rule_insights?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      ai_conversations: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          is_pinned: boolean;
          created_at: string;
          updated_at: string;
          last_message_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          title?: string;
          is_pinned?: boolean;
          created_at?: string;
          updated_at?: string;
          last_message_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          title?: string;
          is_pinned?: boolean;
          created_at?: string;
          updated_at?: string;
          last_message_at?: string;
        };
        Relationships: [];
      };

      ai_messages: {
        Row: {
          id: string;
          conversation_id: string;
          role: "user" | "assistant";
          content: string;
          provider: "local" | "openai" | "fallback" | null;
          model: string | null;
          confidence: number | null;
          status: "pending" | "streaming" | "completed" | "stopped" | "error";
          metadata: Record<string, unknown> | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          conversation_id: string;
          role: "user" | "assistant";
          content: string;
          provider?: "local" | "openai" | "fallback" | null;
          model?: string | null;
          confidence?: number | null;
          status?: "pending" | "streaming" | "completed" | "stopped" | "error";
          metadata?: Record<string, unknown> | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          conversation_id?: string;
          role?: "user" | "assistant";
          content?: string;
          provider?: "local" | "openai" | "fallback" | null;
          model?: string | null;
          confidence?: number | null;
          status?: "pending" | "streaming" | "completed" | "stopped" | "error";
          metadata?: Record<string, unknown> | null;
          created_at?: string;
        };
        Relationships: [];
      };

      investments: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          type: "stock" | "crypto" | "fund" | "gold" | "other";
          symbol: string | null;
          investedAmount: number;
          currentValue: number;
          purchaseDate: string | null;
          notes: string | null;
          quantity: number | null;
          averageCost: number | null;
          currentPrice: number | null;
        };
        Insert: {
          id: string;
          user_id: string;
          name: string;
          type: "stock" | "crypto" | "fund" | "gold" | "other";
          symbol?: string | null;
          investedAmount: number;
          currentValue?: number;
          purchaseDate?: string | null;
          notes?: string | null;
          quantity?: number | null;
          averageCost?: number | null;
          currentPrice?: number | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          type?: "stock" | "crypto" | "fund" | "gold" | "other";
          symbol?: string | null;
          investedAmount?: number;
          currentValue?: number;
          purchaseDate?: string | null;
          notes?: string | null;
          quantity?: number | null;
          averageCost?: number | null;
          currentPrice?: number | null;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
