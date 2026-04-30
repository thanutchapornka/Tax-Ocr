import React, { useState, useRef, useEffect } from 'react';
import { 
  Upload, FileImage, FileText, CheckCircle, Receipt, 
  Download, Copy, Trash2, Edit, X, AlertTriangle, AlertCircle
} from 'lucide-react';
import { extractReceiptData } from './lib/gemini';
import { ReceiptData } from './types';
import { cn, generateId, downloadCSV, copyToClipboardAsTSV, formatCurrency } from './lib/utils';

export default function App() {
  const [imageQueue, setImageQueue] = useState<File[]>([]);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [receipts, setReceipts] = useState<ReceiptData[]>([]);
  
  // Edit State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Partial<ReceiptData>>({});
  
  // Toast State
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const showToast = (message: string) => {
    setToastMessage(message);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const files = Array.from(e.target.files);
      setImageQueue(prev => [...prev, ...files]);
      
      // Reset input so the same files can be chosen again if needed
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  useEffect(() => {
    const processQueue = async () => {
      if (imageQueue.length > 0 && !isExtracting) {
        setIsExtracting(true);
        const file = imageQueue[0];
        setImageFile(file);
        
        const url = URL.createObjectURL(file);
        setImagePreviewUrl(url);

        try {
          const reader = new FileReader();
          reader.onloadend = async () => {
            const base64String = (reader.result as string).split(',')[1];
            try {
                const data = await extractReceiptData(base64String, file.type);
                
                let remarks: string[] = [];
                if (!data.company_name) remarks.push("ไม่มีชื่อบริษัท");
                if (!data.document_number) remarks.push("ไม่มีเลขที่เอกสาร");
                if (data.tax_id && data.tax_id.replace(/\D/g, '').length !== 13) remarks.push("เลขภาษีไม่ครบ 13 หลัก");
                else if (!data.tax_id) remarks.push("ไม่มีเลขผู้เสียภาษี");
                if (!data.income_amount) remarks.push("ไม่พบยอดเงิน");
                
                let status: 'success' | 'warning' | 'error' = remarks.length > 0 ? 'warning' : 'success';

                const newReceipt: ReceiptData = {
                  id: generateId(),
                  fileName: file.name,
                  date: data.date || '',
                  document_number: data.document_number || '',
                  company_name: data.company_name || '',
                  tax_id: data.tax_id || '',
                  income_type: data.income_type || '',
                  income_amount: Number(data.income_amount) || 0,
                  tax_rate: Number(data.tax_rate) || 0,
                  tax_amount: Number(data.tax_amount) || 0,
                  net_amount: Number(data.net_amount) || 0,
                  remarks: remarks.join(", "),
                  status
                };
                
                setReceipts(prev => [newReceipt, ...prev]);
                if (status === 'warning') {
                    showToast(`คำเตือน: เอกสาร ${file.name} ข้อมูลไม่ครบถ้วน`);
                } else {
                    showToast(`อ่านข้อมูลลงตารางสำเร็จ: ${newReceipt.fileName}`);
                }
            } catch (err: any) {
                console.error("Extraction error:", err);
                const errMsg = err?.message || err?.toString() || "";
                let alertMsg = `ไม่สามารถอ่านข้อมูลจาก ${file.name} ได้`;
                if (errMsg.includes('429') || errMsg.includes('RESOURCE_EXHAUSTED')) {
                    alertMsg = `ระบบจำกัดการใช้งานชั่วคราวขณะอ่าน ${file.name} โปรดลองใหม่`;
                }
                showToast(alertMsg);
                
                const newReceipt: ReceiptData = {
                  id: generateId(),
                  fileName: file.name,
                  date: '',
                  document_number: '',
                  company_name: '',
                  tax_id: '',
                  income_type: '',
                  income_amount: 0,
                  tax_rate: 0,
                  tax_amount: 0,
                  net_amount: 0,
                  remarks: alertMsg,
                  status: 'error'
                };
                setReceipts(prev => [newReceipt, ...prev]);
            } finally {
                // Introduce a 4.5 seconds delay between requests to avoid hitting rate limits
                setTimeout(() => {
                    setImageQueue(prev => prev.slice(1));
                    setIsExtracting(false);
                }, 4500);
            }
          };
          reader.readAsDataURL(file);
        } catch (e) {
          console.error(e);
          showToast("เกิดข้อผิดพลาดในการโหลดไฟล์");
          setImageQueue(prev => prev.slice(1));
          setIsExtracting(false);
        }
      } else if (imageQueue.length === 0 && !isExtracting && imageFile) {
        // Clear preview a little after finishing
        const timer = setTimeout(() => {
            setImageFile(null);
            setImagePreviewUrl(null);
        }, 1500);
        return () => clearTimeout(timer);
      }
    };
    
    processQueue();
  }, [imageQueue, isExtracting, imageFile]);

  const clearCurrent = () => {
    setImageQueue([]);
    setImageFile(null);
    setImagePreviewUrl(null);
    setIsExtracting(false);
  };

  const removeReceipt = (id: string) => {
    setReceipts(prev => prev.filter(r => r.id !== id));
    if (editingId === id) cancelEdit();
  };
  
  const editReceipt = (id: string) => {
    const receipt = receipts.find(r => r.id === id);
    if (receipt) {
      setEditingId(id);
      setFormData(receipt);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const saveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingId) return;
    
    let remarks: string[] = [];
    if (!formData.company_name) remarks.push("ไม่มีชื่อบริษัท");
    if (!formData.document_number) remarks.push("ไม่มีเลขที่เอกสาร");
    if (formData.tax_id && formData.tax_id.replace(/\D/g, '').length !== 13) remarks.push("เลขภาษีไม่ครบ 13 หลัก");
    else if (!formData.tax_id) remarks.push("ไม่มีเลขผู้เสียภาษี");
    if (!formData.income_amount) remarks.push("ไม่พบยอดเงิน");
    
    let status: 'success' | 'warning' | 'error' = remarks.length > 0 ? 'warning' : 'success';

    setReceipts(prev => prev.map(r => r.id === editingId ? {
      ...r,
      date: formData.date || '',
      document_number: formData.document_number || '',
      company_name: formData.company_name || '',
      tax_id: formData.tax_id || '',
      income_type: formData.income_type || '',
      income_amount: Number(formData.income_amount) || 0,
      tax_rate: Number(formData.tax_rate) || 0,
      tax_amount: Number(formData.tax_amount) || 0,
      net_amount: Number(formData.net_amount) || 0,
      remarks: remarks.join(", "),
      status,
    } : r));
    
    setEditingId(null);
    setFormData({});
    showToast("บันทึกการแก้ไขแล้ว");
  };

  const cancelEdit = () => {
    setEditingId(null);
    setFormData({});
  };

  const handleExportCSV = () => {
    if (receipts.length === 0) return showToast("ไม่มีข้อมูลให้ Export");
    // Format for ERP Export
    const exportData = receipts.map(r => ({
      "วันที่": r.date,
      "เลขที่เอกสาร": r.document_number,
      "ชื่อบริษัท": r.company_name,
      "รหัสผู้เสียภาษี": r.tax_id,
      "ประเภทเงินได้": r.income_type,
      "จำนวนเงิน": r.income_amount,
      "อัตราภาษี (%)": r.tax_rate,
      "ภาษีหัก ณ ที่จ่าย": r.tax_amount,
      "จำนวนเงินสุทธิ": r.net_amount
    }));
    downloadCSV(exportData, `tax-export-${new Date().toISOString().split('T')[0]}.csv`);
    showToast("ดาวน์โหลดไฟล์ CSV แล้ว");
  };

  const handleCopyTSV = () => {
    if (receipts.length === 0) return showToast("ไม่มีข้อมูลให้ Copy");
    const exportData = receipts.map(r => ({
      "วันที่": r.date,
      "เลขที่เอกสาร": r.document_number,
      "ชื่อบริษัท": r.company_name,
      "รหัสผู้เสียภาษี": r.tax_id,
      "ประเภทเงินได้": r.income_type,
      "จำนวนเงิน": r.income_amount,
      "อัตราภาษี (%)": r.tax_rate,
      "ภาษีหัก ณ ที่จ่าย": r.tax_amount,
      "จำนวนเงินสุทธิ": r.net_amount
    }));
    if (copyToClipboardAsTSV(exportData)) {
      showToast("คัดลอกข้อมูลแล้ว สามารถนำไปวางลงใน Google Sheets ได้เลย");
    }
  };

  const handleFormChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: ["income_amount", "tax_rate", "tax_amount", "net_amount"].includes(name) ? Number(value) : value
    }));
  };

  const totalDocs = receipts.length;
  const totalIncome = receipts.reduce((sum, r) => sum + r.income_amount, 0);
  const totalTax = receipts.reduce((sum, r) => sum + r.tax_amount, 0);
  const totalNet = receipts.reduce((sum, r) => sum + r.net_amount, 0);
  const errorCount = receipts.filter(r => r.status === 'error' || r.status === 'warning').length;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-4 right-4 bg-emerald-600 text-white px-6 py-3 rounded-lg shadow-xl flex items-center gap-3 z-50 animate-in fade-in slide-in-from-top-5">
          <CheckCircle className="w-5 h-5" />
          <span className="font-medium">{toastMessage}</span>
        </div>
      )}

      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white">
              <Receipt className="w-5 h-5" />
            </div>
            <h1 className="font-semibold text-xl tracking-tight text-slate-800">
              Tax Receipt Data Entry
            </h1>
          </div>
          <div className="flex gap-3">
            <button
              onClick={handleCopyTSV}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 shadow-sm transition-colors"
            >
              <Copy className="w-4 h-4" />
              Copy to Sheets
            </button>
            <button
              onClick={handleExportCSV}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 shadow-sm transition-colors"
            >
              <Download className="w-4 h-4" />
              Export CSV
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Workspace: Image & Form */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
          
          {/* Left: Image Uploader */}
          <div className="bg-white shadow-sm border border-slate-200 rounded-xl overflow-hidden flex flex-col h-[600px]">
            <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
              <div className="flex items-center gap-2 text-slate-700 font-medium">
                <FileImage className="w-5 h-5 text-slate-400" />
                อัปโหลดเอกสาร (เลือกได้หลายไฟล์)
              </div>
              <div className="flex items-center gap-4">
                {imageQueue.length > 0 && (
                  <span className="text-xs font-semibold bg-blue-100 text-blue-700 px-2 py-1 rounded-full">
                    รอคิว {imageQueue.length} ไฟล์
                  </span>
                )}
                {(imageQueue.length > 0 || isExtracting) && (
                  <button onClick={clearCurrent} className="text-xs text-slate-500 hover:text-red-500 underline uppercase tracking-wider font-semibold">
                    Stop & Clear
                  </button>
                )}
              </div>
            </div>
            <div className="flex-1 p-6 flex flex-col items-center justify-center relative bg-slate-50/50">
              {imagePreviewUrl ? (
                <div className="relative w-full h-full flex justify-center items-center">
                  <img src={imagePreviewUrl} alt="Receipt preview" className="max-h-full max-w-full object-contain rounded drop-shadow-sm" />
                </div>
              ) : (
                <label className="flex flex-col items-center justify-center w-full h-full border-2 border-dashed border-slate-300 rounded-xl cursor-pointer hover:bg-slate-50 hover:border-blue-400 transition-colors">
                  <div className="flex flex-col items-center justify-center pt-5 pb-6 text-slate-500">
                    <Upload className="w-10 h-10 mb-3 text-slate-400" />
                    <p className="mb-2 text-sm font-medium"><span className="text-blue-600">คลิกอัปโหลด</span> หรือลากไฟล์มาวาง</p>
                    <p className="text-xs text-slate-400">รองรับไฟล์ JPG, PNG, เลือกพร้อมกันได้หลายไฟล์</p>
                  </div>
                  <input ref={fileInputRef} type="file" multiple className="hidden" accept="image/*" onChange={handleImageChange} />
                </label>
              )}
              
              {/* Extracting Overlay */}
              {isExtracting && (
                <div className="absolute inset-0 bg-white/90 backdrop-blur-sm flex flex-col items-center justify-center rounded-xl z-10">
                  <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mb-4" />
                  <p className="font-medium text-slate-700">กำลังแยกข้อมูลด้วย AI...</p>
                  <p className="text-sm text-slate-500 mt-1">จะถูกบันทึกลงตารางอัตโนมัติเมื่อเสร็จสิ้น</p>
                  {imageQueue.length > 0 && (
                    <p className="text-xs font-medium text-blue-600 mt-3 bg-blue-50 px-3 py-1 rounded-full">
                      เหลืออีก {imageQueue.length} ไฟล์ในคิว
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Right: Data Form (Edit Mode) */}
          <div className={`bg-white shadow-sm border rounded-xl h-[600px] flex flex-col transition-all ${editingId ? 'border-blue-300 ring-2 ring-blue-50' : 'border-slate-200'}`}>
            <div className={`p-4 border-b flex justify-between items-center ${editingId ? 'bg-blue-50 border-blue-100' : 'bg-slate-50 border-slate-100'}`}>
              <div className="flex items-center gap-2 text-slate-700 font-medium">
                <FileText className={`w-5 h-5 ${editingId ? 'text-blue-500' : 'text-slate-400'}`} />
                {editingId ? 'แก้ไขข้อมูลแถวที่เลือก' : 'พื้นที่แก้ไขข้อมูล (Edit Mode)'}
              </div>
              {editingId && (
                <button onClick={cancelEdit} className="text-slate-400 hover:text-slate-600">
                  <X className="w-5 h-5" />
                </button>
              )}
            </div>
            
            <div className="flex-1 overflow-y-auto p-6">
              {!editingId ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-400">
                  <Edit className="w-12 h-12 mb-4 text-slate-300 opacity-50" />
                  <p className="text-center max-w-sm">
                    ข้อมูลจากภาพจะถูกดึงลงตารางอัตโนมัติ<br/>
                    หากต้องการแก้ไข ให้คลิกปุ่ม <Edit className="w-3 h-3 inline mx-1"/> ท้ายแถวในตาราง
                  </p>
                </div>
              ) : (
                <form id="edit-form" onSubmit={saveEdit} className="space-y-5 animate-in fade-in">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">วันที่ (Date)</label>
                      <input 
                        type="text" name="date" value={formData.date || ''} onChange={handleFormChange}
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        placeholder="YYYY-MM-DD"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">เลขที่เอกสาร (Doc No.)</label>
                      <input 
                        type="text" name="document_number" value={formData.document_number || ''} onChange={handleFormChange}
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">เลขประจำตัวผู้เสียภาษี (Tax ID)</label>
                    <input 
                      type="text" name="tax_id" value={formData.tax_id || ''} onChange={handleFormChange}
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono"
                      placeholder="13 digits"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">ชื่อบริษัท (Company Name)</label>
                    <input 
                      type="text" name="company_name" value={formData.company_name || ''} onChange={handleFormChange}
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">ประเภทเงินได้ (Income Type)</label>
                    <input 
                      type="text" name="income_type" value={formData.income_type || ''} onChange={handleFormChange}
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="เช่น ค่าบริการ, ค่าขนส่ง"
                    />
                  </div>

                  <div className="grid grid-cols-4 gap-4 pt-4 border-t border-slate-100">
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">จำนวนเงิน</label>
                      <input 
                        type="number" step="0.01" name="income_amount" value={formData.income_amount || ''} onChange={handleFormChange}
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-right"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">อัตรา(%)</label>
                      <input 
                        type="number" step="0.01" name="tax_rate" value={formData.tax_rate || ''} onChange={handleFormChange}
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-right"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">ภาษี</label>
                      <input 
                        type="number" step="0.01" name="tax_amount" value={formData.tax_amount || ''} onChange={handleFormChange}
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-right"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">ยอดสุทธิ</label>
                      <input 
                        type="number" step="0.01" name="net_amount" value={formData.net_amount || ''} onChange={handleFormChange}
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-right font-medium bg-slate-50"
                      />
                    </div>
                  </div>
                </form>
              )}
            </div>
            
            {/* Form Actions */}
            {editingId && (
              <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-3 rounded-b-xl">
                <button 
                  type="button" 
                  onClick={cancelEdit}
                  className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 bg-white border border-slate-300 rounded-md shadow-sm transition-all"
                >
                  ยกเลิก
                </button>
                <button 
                  type="submit" 
                  form="edit-form"
                  className="flex items-center gap-2 px-6 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 focus:ring-2 focus:ring-offset-2 focus:ring-blue-600 shadow-sm transition-all"
                >
                  <CheckCircle className="w-4 h-4" />
                  บันทึกการแก้ไข
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Bottom: Result Table */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 flex flex-col sm:flex-row justify-between items-start sm:items-center bg-slate-50/50 gap-4">
            <h2 className="text-lg font-semibold text-slate-800">ข้อมูลที่บันทึกแล้ว ({totalDocs})</h2>
            <div className="flex flex-wrap gap-4 text-sm">
              <div className="bg-white px-3 py-1.5 rounded-md border border-slate-200 shadow-sm">
                <span className="text-slate-500 mr-2">ยอดเงินรวม:</span>
                <span className="font-semibold text-slate-800">{formatCurrency(totalIncome)}</span>
              </div>
              <div className="bg-white px-3 py-1.5 rounded-md border border-slate-200 shadow-sm">
                <span className="text-slate-500 mr-2">ภาษีรวม:</span>
                <span className="font-semibold text-slate-800">{formatCurrency(totalTax)}</span>
              </div>
              <div className="bg-white px-3 py-1.5 rounded-md border border-slate-200 shadow-sm">
                <span className="text-slate-500 mr-2">ยอดสุทธิรวม:</span>
                <span className="font-semibold text-slate-800">{formatCurrency(totalNet)}</span>
              </div>
              {errorCount > 0 && (
                <div className="bg-red-50 text-red-700 px-3 py-1.5 rounded-md border border-red-100 font-medium flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4" />
                  พบข้อผิดพลาด {errorCount} รายการ
                </div>
              )}
            </div>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-slate-500 bg-slate-50 uppercase tracking-wider border-b border-slate-200">
                <tr>
                  <th className="px-6 py-3 font-medium">ไฟล์/สถานะ</th>
                  <th className="px-6 py-3 font-medium">วันที่</th>
                  <th className="px-6 py-3 font-medium">เลขที่เอกสาร</th>
                  <th className="px-6 py-3 font-medium">รหัสผู้เสียภาษี</th>
                  <th className="px-6 py-3 font-medium">ชื่อบริษัท</th>
                  <th className="px-6 py-3 font-medium text-right">ยอดสุทธิ</th>
                  <th className="px-6 py-3 font-medium text-center">จัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {receipts.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-slate-400">
                      ยังไม่มีข้อมูลเอกสาร
                    </td>
                  </tr>
                ) : (
                  receipts.map((row) => (
                    <tr key={row.id} className={`hover:bg-slate-50/80 transition-colors ${editingId === row.id ? 'bg-blue-50/50' : ''}`}>
                      <td className="px-6 py-4">
                        <div className="flex flex-col gap-1">
                          <span className="text-slate-600 font-medium truncate max-w-[150px]" title={row.fileName}>{row.fileName || '-'}</span>
                          {row.status === 'error' ? (
                            <span className="inline-flex items-center gap-1 text-xs text-red-600 bg-red-50 px-2 py-0.5 rounded-full w-fit">
                              <AlertCircle className="w-3 h-3" /> ล้มเหลว
                            </span>
                          ) : row.status === 'warning' ? (
                            <span className="inline-flex items-center gap-1 text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full w-fit">
                              <AlertTriangle className="w-3 h-3" /> ข้อมูลไม่ครบ
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full w-fit">
                              <CheckCircle className="w-3 h-3" /> สมบูรณ์
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-slate-600">{row.date}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-slate-600">{row.document_number}</td>
                      <td className="px-6 py-4 whitespace-nowrap font-mono text-slate-500">{row.tax_id}</td>
                      <td className="px-6 py-4">
                        <div className="text-slate-800 font-medium">{row.company_name}</div>
                        {(row.status === 'warning' || row.status === 'error') && row.remarks && (
                          <div className="text-xs text-red-500 mt-1 max-w-[200px] break-words">
                            * {row.remarks}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right font-medium text-slate-900">{formatCurrency(row.net_amount)}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button 
                            onClick={() => editReceipt(row.id)}
                            className={`p-1 rounded transition-colors ${editingId === row.id ? 'text-blue-600 bg-blue-100' : 'text-slate-400 hover:text-blue-600 hover:bg-blue-50'}`}
                            title="แก้ไข"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={() => removeReceipt(row.id)}
                            className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                            title="ลบ"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
