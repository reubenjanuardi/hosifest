'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { clearSession } from '@/lib/admin-auth';

export function AdminSessionBar() {
  const [user, setUser] = useState<{ name: string; email: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Session already validated by AdminRouteGuard; we only need user info
    // from the cookie that was set on login. We read it via the same
    // client-side fetch that the guard uses.
    fetch('/api/admin/me', { credentials: 'include' })
      .then((r) => r.json())
      .then((data) => {
        if (data?.user) setUser(data.user);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSignOut = () => {
    clearSession();
    window.location.href = '/admin/login';
  };

  if (loading) return null;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '8px 16px',
        borderTop: '1px solid var(--border)',
        background: 'var(--card)',
      }}
    >
      {user && (
        <span style={{ fontSize: '13px', color: 'var(--muted-foreground)' }}>
          {user.name} ({user.email})
        </span>
      )}
      <div style={{ flex: 1 }} />
      <Button variant="ghost" size="sm" onClick={handleSignOut}>
        Sign out
      </Button>
    </div>
  );
}