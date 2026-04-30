export interface ReceiptData {
  id: string; // Internal id for table row
  fileName?: string;
  date: string;
  document_number: string;
  company_name: string;
  tax_id: string;
  income_type: string;
  income_amount: number;
  tax_rate: number;
  tax_amount: number;
  net_amount: number;
  remarks?: string;
  status?: 'success' | 'warning' | 'error';
}
