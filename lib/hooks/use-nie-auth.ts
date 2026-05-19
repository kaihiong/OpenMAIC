'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface NieUser {
  name: string;
  email: string;
  department: string;
}

export function useNieAuth() {
  const [nieAuthEnabled, setNieAuthEnabled] = useState(false);
  const [user, setUser] = useState<NieUser | null>(null);
  const router = useRouter();

  useEffect(() => {
    fetch('/api/auth/config')
      .then((r) => r.json())
      .then((d) => {
        const enabled = d?.nieAuthEnabled ?? false;
        setNieAuthEnabled(enabled);
        if (enabled) {
          return fetch('/api/auth/me')
            .then((r) => r.ok ? r.json() : null)
            .then((d) => setUser(d ? { name: d.name, email: d.email, department: d.department } : null))
            .catch(() => {});
        }
      })
      .catch(() => {});
  }, []);

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  };

  return { nieAuthEnabled, user, logout };
}
