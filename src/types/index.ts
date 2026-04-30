export type TransactionType = 'income' | 'expense';
export type BudgetPeriod = 'daily' | 'weekly' | 'monthly' | 'yearly';
export type NotificationFrequency = 'daily' | 'weekly' | 'monthly' | 'custom';
export type InvestmentType = 'stocks' | 'crypto' | 'retirement' | 'bonds' | 'real_estate' | 'other';
export type AccountType = 'cash' | 'bank' | 'mobile_money' | 'other';

export interface Profile {
  id: string;
  email: string;
  full_name?: string;
  primary_currency: string;
  secondary_currency: string;
  created_at: string;
}

export interface Category {
  id: string;
  user_id: string;
  name: string;
  type: TransactionType | 'both';
  color: string;
  icon: string;
  is_default: boolean;
  created_at: string;
}

export interface Account {
  id: string;
  user_id: string;
  name: string;
  type: AccountType;
  currency: string;
  is_default: boolean;
}

export interface Transaction {
  id: string;
  user_id: string;
  account_id: string;
  category_id: string;
  type: TransactionType;
  amount: number;
  currency: string;
  description?: string;
  date: string;
  is_recurring: boolean;
  recurrence?: 'daily' | 'weekly' | 'monthly';
  receipt_url?: string;
  created_at: string;
  category?: Category;
  account?: Account;
}

export interface Budget {
  id: string;
  user_id: string;
  category_id?: string;
  amount: number;
  period: BudgetPeriod;
  currency: string;
  created_at: string;
  category?: Category;
  spent?: number;
  percentage?: number;
  remaining?: number;
}

export interface SavingsGoal {
  id: string;
  user_id: string;
  name: string;
  target_amount: number;
  current_amount: number;
  currency: string;
  deadline?: string;
  color: string;
  created_at: string;
}

export interface Investment {
  id: string;
  user_id: string;
  name: string;
  type: InvestmentType;
  amount: number;
  currency: string;
  date: string;
  notes?: string;
  created_at: string;
}

export interface NotificationSettings {
  id: string;
  user_id: string;
  enabled: boolean;
  frequency: NotificationFrequency;
  custom_interval_days?: number;
  notification_time: string;
  day_of_week?: number;
  day_of_month?: number;
  created_at: string;
}

export interface MonthlyStats {
  income: number;
  expense: number;
  balance: number;
}

export interface CategoryBreakdown {
  name: string;
  color: string;
  icon: string;
  total: number;
}

export interface MonthSeries {
  label: string;
  income: number;
  expense: number;
}
