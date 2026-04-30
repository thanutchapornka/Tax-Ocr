import { GoogleGenAI, Type } from "@google/genai";
import { ReceiptData } from "../types";

// Note: environment variable is injected by Vite config
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY as string });

export async function extractReceiptData(base64Image: string, mimeType: string): Promise<Partial<ReceiptData>> {
  const response = await ai.models.generateContent({
    model: "gemini-2.0-flash",
    contents: [
      {
         role: 'user', 
         parts: [
           { inlineData: { data: base64Image, mimeType: mimeType } },
           { text: `You are an expert Thai accountant. Read this document (Withholding Tax Certificate, Receipt, or Invoice). Extract the following information and return it in JSON:
- date: The document date (Format as YYYY-MM-DD if possible).
- document_number: Document number / เลขที่เอกสาร (e.g., เล่มที่/เลขที่).
- company_name: Name of the company, vendor, or the entity responsible for withholding tax (ชื่อผู้มีหน้าที่หักภาษี ณ ที่จ่าย, vendor name, ชื่อบริษัท).
- tax_id: Tax identification number (เลขประจำตัวผู้เสียภาษี). Usually 13 digits.
- income_type: Type of income or service (ประเภทเงินได้, รายการ, ค่าบริการ).
- income_amount: The pre-tax amount / จำนวนเงินได้ / มูลค่าสินค้า. Numeric value only.
- tax_rate: Tax rate percentage (อัตราภาษี % เช่น 1, 3, 5, 7). Numeric value only.
- tax_amount: Tax amount / จำนวนเงินภาษีหัก ณ ที่จ่าย หรือ VAT. Numeric value only.
- net_amount: Net amount / จำนวนเงินสุทธิ หรือยอดรวมทั้งสิ้น. Numeric value only.

If any field is completely unreadable or missing, keep it as empty string or 0 for numbers, but try your best to deduce from the document context. Use Thai language or English based on the original content, but numeric values should just be pure numbers.` }
         ]
      }
    ],
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          date: { type: Type.STRING },
          document_number: { type: Type.STRING },
          company_name: { type: Type.STRING },
          tax_id: { type: Type.STRING },
          income_type: { type: Type.STRING },
          income_amount: { type: Type.NUMBER },
          tax_rate: { type: Type.NUMBER },
          tax_amount: { type: Type.NUMBER },
          net_amount: { type: Type.NUMBER }
        },
      }
    }
  });

  if (!response.text) return {};
  
  try {
    return JSON.parse(response.text.trim());
  } catch (e) {
    console.error("Failed to parse JSON response:", e);
    return {};
  }
}
