export function cn(...classes: (string | undefined | null | false)[]) {
  return classes.filter(Boolean).join(' ');
}

export function generateId() {
  return Math.random().toString(36).substring(2, 9);
}

export function formatCurrency(value: number) {
  return new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' }).format(value || 0);
}

export function downloadCSV(data: any[], filename = 'export.csv') {
  if (!data || !data.length) return;

  const headers = Object.keys(data[0]);
  const rows = data.map(row => 
    headers.map(header => {
      const cell = row[header] === null || row[header] === undefined ? '' : row[header];
      return `"${String(cell).replace(/"/g, '""')}"`;
    }).join(',')
  );

  const csvContent = [headers.join(','), ...rows].join('\n');
  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' }); // \uFEFF is BOM for UTF-8 Excel support
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export function copyToClipboardAsTSV(data: any[]) {
  if (!data || !data.length) return false;
  
  const headers = Object.keys(data[0]);
  const rows = data.map(row => 
    headers.map(header => {
      const cell = row[header] === null || row[header] === undefined ? '' : row[header];
      return String(cell).replace(/\t/g, ' ').replace(/\n/g, ' ');
    }).join('\t')
  );
  
  const tsvContent = [headers.join('\t'), ...rows].join('\n');
  navigator.clipboard.writeText(tsvContent);
  return true;
}
