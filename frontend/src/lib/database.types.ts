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
          name: string;
          type: "cash" | "bank" | "ewallet" | "investment";
          balance: number;
        };
        Insert: {
          id: string;
          name: string;
          type: "cash" | "bank" | "ewallet" | "investment";
          balance?: number;
        };
        Update: {
          id?: string;
          name?: string;
          type?: "cash" | "bank" | "ewallet" | "investment";
          balance?: number;
        };
        Relationships: [];
      };

      categories: {
        Row: {
          id: string;
          name: string;
          type: "income" | "expense";
        };
        Insert: {
          id: string;
          name: string;
          type: "income" | "expense";
        };
        Update: {
          id?: string;
          name?: string;
          type?: "income" | "expense";
        };
        Relationships: [];
      };

      transactions: {
        Row: {
          id: string;
          type: "income" | "expense";
          amount: number;
          categoryId: string;
          walletId: string;
          note: string;
          date: string;
        };
        Insert: {
          id: string;
          type: "income" | "expense";
          amount: number;
          categoryId: string;
          walletId: string;
          note?: string;
          date: string;
        };
        Update: {
          id?: string;
          type?: "income" | "expense";
          amount?: number;
          categoryId?: string;
          walletId?: string;
          note?: string;
          date?: string;
        };
        Relationships: [];
      };

      debts: {
        Row: {
          id: string;
          name: string;
          totalAmount: number;
          remainingAmount: number;
        };
        Insert: {
          id: string;
          name: string;
          totalAmount: number;
          remainingAmount: number;
        };
        Update: {
          id?: string;
          name?: string;
          totalAmount?: number;
          remainingAmount?: number;
        };
        Relationships: [];
      };

      goals: {
        Row: {
          id: string;
          name: string;
          targetAmount: number;
          currentAmount: number;
        };
        Insert: {
          id: string;
          name: string;
          targetAmount: number;
          currentAmount?: number;
        };
        Update: {
          id?: string;
          name?: string;
          targetAmount?: number;
          currentAmount?: number;
        };
        Relationships: [];
      };

      budgets: {
        Row: {
          id: string;
          categoryId: string;
          month: string;
          limitAmount: number;
        };
        Insert: {
          id: string;
          categoryId: string;
          month: string;
          limitAmount: number;
        };
        Update: {
          id?: string;
          categoryId?: string;
          month?: string;
          limitAmount?: number;
        };
        Relationships: [];
      };

      investments: {
        Row: {
          id: string;
          name: string;
          type: "stock" | "crypto" | "fund" | "gold" | "other";
          symbol: string | null;
          investedAmount: number;
          currentValue: number;
          purchaseDate: string | null;
          notes: string | null;
        };
        Insert: {
          id: string;
          name: string;
          type: "stock" | "crypto" | "fund" | "gold" | "other";
          symbol?: string | null;
          investedAmount: number;
          currentValue?: number;
          purchaseDate?: string | null;
          notes?: string | null;
        };
        Update: {
          id?: string;
          name?: string;
          type?: "stock" | "crypto" | "fund" | "gold" | "other";
          symbol?: string | null;
          investedAmount?: number;
          currentValue?: number;
          purchaseDate?: string | null;
          notes?: string | null;
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
