import { redirect } from 'next/navigation';

export default function JournalEntriesRedirect() {
  redirect('/accounting/ledger?tab=journals');
}
