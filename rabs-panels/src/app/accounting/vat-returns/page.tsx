import { redirect } from 'next/navigation';

export default function VatReturnsRedirect() {
  redirect('/accounting/vat');
}
