export async function listInvoices() {
  const response = await fetch('/api/v1/invoices');
  return response.json();
}

export async function showInvoice(id: number) {
  const response = await fetch(`/api/v1/invoices/${id}`);
  return response.json();
}
