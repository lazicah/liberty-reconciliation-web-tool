export const formatCurrency = (amount: number, currency: string = 'NGN'): string => {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
};

export const formatDate = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-NG', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
};

export const formatNumber = (num: number): string => {
  return new Intl.NumberFormat('en-NG').format(num);
};

export const calculatePercentage = (value: number, total: number): number => {
  return total === 0 ? 0 : (value / total) * 100;
};

export const downloadJSON = (data: unknown, filename: string): void => {
  const element = document.createElement('a');
  element.setAttribute(
    'href',
    'data:text/plain;charset=utf-8,' + encodeURIComponent(JSON.stringify(data, null, 2))
  );
  element.setAttribute('download', filename);
  element.style.display = 'none';
  document.body.appendChild(element);
  element.click();
  document.body.removeChild(element);
};

export const downloadCSV = (data: unknown[], filename: string): void => {
  const array = Array.isArray(data) ? data : [data];
  if (array.length === 0) return;

  const headers = Object.keys(array[0] as Record<string, unknown>);
  const csv = [
    headers.join(','),
    ...array.map((row) =>
      headers
        .map((field) => {
          const value = (row as Record<string, unknown>)[field];
          return typeof value === 'string' && value.includes(',')
            ? `"${value}"`
            : value;
        })
        .join(',')
    ),
  ].join('\n');

  downloadJSON(csv, filename);
};
