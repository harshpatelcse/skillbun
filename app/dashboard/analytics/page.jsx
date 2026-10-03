'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function DeprecatedDashboardAnalyticsPage() {
  const router = useRouter();

  useEffect(() => {
    // Redirect seamlessly to the new unified Admin Analytics route
    router.replace('/dashboard/console/admin/analytics');
  }, [router]);

  return (
    <div style={{ minHeight: '70vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '1rem' }}>
      <svg aria-hidden="true" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="1.8"><path d="M20 7v5h-5M4 17v-5h5M5 8a7 7 0 0 1 12-3l3 3M4 16l3 3a7 7 0 0 0 12-3"/></svg>
      <p style={{ color: 'var(--muted)', fontSize: '1rem' }}>Redirecting to Unified Admin Console...</p>
    </div>
  );
}
