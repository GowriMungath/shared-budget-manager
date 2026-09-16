// Database types generated from Supabase schema
// This file is a placeholder for generated types from Supabase CLI
// For now, we define the basic structure

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          display_name: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          display_name?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          display_name?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      households: {
        Row: {
          id: string;
          name: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      household_members: {
        Row: {
          id: string;
          household_id: string;
          user_id: string;
          role: "owner" | "member";
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          household_id: string;
          user_id: string;
          role?: "owner" | "member";
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          household_id?: string;
          user_id?: string;
          role?: "owner" | "member";
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      participants: {
        Row: {
          id: string;
          household_id: string;
          name: string;
          kind: "household-member" | "external";
          member_key: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          household_id: string;
          name: string;
          kind?: "household-member" | "external";
          member_key?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          household_id?: string;
          name?: string;
          kind?: "household-member" | "external";
          member_key?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      categories: {
        Row: {
          id: string;
          household_id: string;
          name: string;
          group_name: string;
          scope: "shared" | "personal";
          archived: boolean;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          household_id: string;
          name: string;
          group_name: string;
          scope?: "shared" | "personal";
          archived?: boolean;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Update: {
          id?: string;
          household_id?: string;
          name?: string;
          group_name?: string;
          scope?: "shared" | "personal";
          archived?: boolean;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Relationships: [];
      };
      budget_periods: {
        Row: {
          id: string;
          household_id: string;
          name: string;
          start_date: string;
          end_date: string;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          household_id: string;
          name: string;
          start_date: string;
          end_date: string;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Update: {
          id?: string;
          household_id?: string;
          name?: string;
          start_date?: string;
          end_date?: string;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Relationships: [];
      };
      budget_limits: {
        Row: {
          id: string;
          household_id: string;
          budget_period_id: string;
          category_id: string;
          scope: "shared" | "personal";
          owner_participant_id: string | null;
          limit_cents: number;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          household_id: string;
          budget_period_id: string;
          category_id: string;
          scope?: "shared" | "personal";
          owner_participant_id?: string | null;
          limit_cents: number;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Update: {
          id?: string;
          household_id?: string;
          budget_period_id?: string;
          category_id?: string;
          scope?: "shared" | "personal";
          owner_participant_id?: string | null;
          limit_cents?: number;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Relationships: [];
      };
      transactions: {
        Row: {
          id: string;
          household_id: string;
          kind: "expense";
          date: string;
          description: string;
          total_cents: number;
          category_id: string;
          payer_participant_id: string;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          household_id: string;
          kind: "expense";
          date: string;
          description: string;
          total_cents: number;
          category_id: string;
          payer_participant_id: string;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Update: {
          id?: string;
          household_id?: string;
          kind?: "expense";
          date?: string;
          description?: string;
          total_cents?: number;
          category_id?: string;
          payer_participant_id?: string;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Relationships: [];
      };
      allocations: {
        Row: {
          id: string;
          household_id: string;
          transaction_id: string;
          participant_id: string;
          position: number;
          cents: number;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          household_id: string;
          transaction_id: string;
          participant_id: string;
          position: number;
          cents: number;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Update: {
          id?: string;
          household_id?: string;
          transaction_id?: string;
          participant_id?: string;
          position?: number;
          cents?: number;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Relationships: [];
      };
      settlements: {
        Row: {
          id: string;
          household_id: string;
          from_participant_id: string;
          to_participant_id: string;
          cents: number;
          date: string;
          notes: string | null;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          household_id: string;
          from_participant_id: string;
          to_participant_id: string;
          cents: number;
          date: string;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Update: {
          id?: string;
          household_id?: string;
          from_participant_id?: string;
          to_participant_id?: string;
          cents?: number;
          date?: string;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Relationships: [];
      };
      payment_methods: {
        Row: {
          id: string;
          household_id: string;
          name: string;
          owner_participant_id: string;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          household_id: string;
          name: string;
          owner_participant_id: string;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Update: {
          id?: string;
          household_id?: string;
          name?: string;
          owner_participant_id?: string;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Relationships: [];
      };
      goals: {
        Row: {
          id: string;
          household_id: string;
          name: string;
          owner_participant_id: string;
          target_cents: number;
          current_saved_cents: number;
          deadline_month: string;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          household_id: string;
          name: string;
          owner_participant_id: string;
          target_cents: number;
          current_saved_cents?: number;
          deadline_month: string;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Update: {
          id?: string;
          household_id?: string;
          name?: string;
          owner_participant_id?: string;
          target_cents?: number;
          current_saved_cents?: number;
          deadline_month?: string;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Relationships: [];
      };
      obligations: {
        Row: {
          id: string;
          household_id: string;
          owner_scope: "shared" | "personal";
          owner_participant_id: string | null;
          description: string;
          amount_cents: number;
          due_date: string;
          status: "pending" | "paid" | "cancelled";
          type:
            | "credit_card_bill"
            | "travel"
            | "education"
            | "visa"
            | "utility"
            | "other";
          notes: string | null;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          household_id: string;
          owner_scope?: "shared" | "personal";
          owner_participant_id?: string | null;
          description: string;
          amount_cents: number;
          due_date: string;
          status?: "pending" | "paid" | "cancelled";
          type?: "credit_card_bill" | "travel" | "education" | "visa" | "utility" | "other";
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Update: {
          id?: string;
          household_id?: string;
          owner_scope?: "shared" | "personal";
          owner_participant_id?: string | null;
          description?: string;
          amount_cents?: number;
          due_date?: string;
          status?: "pending" | "paid" | "cancelled";
          type?:
            | "credit_card_bill"
            | "travel"
            | "education"
            | "visa"
            | "utility"
            | "other";
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
