import { listInvoices } from '@apps/Billing/api';

export async function grantAccess(id: number) {
  await fetch(`/api/v1/users/${id}`, { method: 'PATCH' });
  return listInvoices();
}
