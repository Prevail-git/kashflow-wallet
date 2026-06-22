export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      devices: {
        Row: {
          created_at: string
          device_label: string
          id: string
          last_seen_at: string
          public_key: string
          user_id: string
        }
        Insert: {
          created_at?: string
          device_label?: string
          id?: string
          last_seen_at?: string
          public_key: string
          user_id: string
        }
        Update: {
          created_at?: string
          device_label?: string
          id?: string
          last_seen_at?: string
          public_key?: string
          user_id?: string
        }
        Relationships: []
      }
      fraud_flags: {
        Row: {
          created_at: string
          flagged_by: string | null
          id: string
          reason: string
          resolved: boolean
          transaction_id: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          flagged_by?: string | null
          id?: string
          reason: string
          resolved?: boolean
          transaction_id?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          flagged_by?: string | null
          id?: string
          reason?: string
          resolved?: boolean
          transaction_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fraud_flags_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string
          id: string
          is_merchant: boolean
          is_suspended: boolean
          phone: string | null
          public_key: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name?: string
          id: string
          is_merchant?: boolean
          is_suspended?: boolean
          phone?: string | null
          public_key?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string
          id?: string
          is_merchant?: boolean
          is_suspended?: boolean
          phone?: string | null
          public_key?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      transactions: {
        Row: {
          amount_cents: number
          created_at: string
          device_id: string | null
          expires_at: string
          failure_reason: string | null
          from_user_id: string
          id: string
          issued_at: string
          note: string | null
          settled_at: string | null
          signed_token: string
          signer_public_key: string | null
          status: Database["public"]["Enums"]["tx_status"]
          submitted_by: string | null
          to_user_id: string
          token_jti: string
        }
        Insert: {
          amount_cents: number
          created_at?: string
          device_id?: string | null
          expires_at: string
          failure_reason?: string | null
          from_user_id: string
          id?: string
          issued_at: string
          note?: string | null
          settled_at?: string | null
          signed_token: string
          signer_public_key?: string | null
          status?: Database["public"]["Enums"]["tx_status"]
          submitted_by?: string | null
          to_user_id: string
          token_jti: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          device_id?: string | null
          expires_at?: string
          failure_reason?: string | null
          from_user_id?: string
          id?: string
          issued_at?: string
          note?: string | null
          settled_at?: string | null
          signed_token?: string
          signer_public_key?: string | null
          status?: Database["public"]["Enums"]["tx_status"]
          submitted_by?: string | null
          to_user_id?: string
          token_jti?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      wallets: {
        Row: {
          balance_cents: number
          updated_at: string
          user_id: string
        }
        Insert: {
          balance_cents?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          balance_cents?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      public_profiles: {
        Row: {
          display_name: string | null
          id: string | null
          is_merchant: boolean | null
          public_key: string | null
        }
        Insert: {
          display_name?: string | null
          id?: string | null
          is_merchant?: boolean | null
          public_key?: string | null
        }
        Update: {
          display_name?: string | null
          id?: string | null
          is_merchant?: boolean | null
          public_key?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      find_user_id_by_email: { Args: { p_email: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_current_user_admin: { Args: never; Returns: boolean }
      settle_transaction: {
        Args: {
          p_amount: number
          p_device_id: string
          p_expires_at: string
          p_from: string
          p_issued_at: string
          p_note: string
          p_signed_token: string
          p_signer_public_key: string
          p_submitter: string
          p_to: string
          p_token_jti: string
        }
        Returns: Json
      }
      topup_wallet: {
        Args: { p_amount: number; p_user: string }
        Returns: Json
      }
    }
    Enums: {
      app_role: "admin" | "user"
      tx_status: "pending" | "confirmed" | "failed" | "flagged"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "user"],
      tx_status: ["pending", "confirmed", "failed", "flagged"],
    },
  },
} as const
