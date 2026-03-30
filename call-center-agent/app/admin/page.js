// ═══════════════════════════════════════════════════════════════════════════
// /admin now redirects to /portal (client login)
// The full dashboard has moved to /admin/super (God Mode)
// ═══════════════════════════════════════════════════════════════════════════
import { redirect } from 'next/navigation';

export default function AdminRedirect() {
    redirect('/portal');
}
