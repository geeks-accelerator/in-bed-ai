'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function AdminPage() {
  const router = useRouter();

  useEffect(() => {
    const adminKey = localStorage.getItem('admin_key');
    if (adminKey) {
      router.replace('/admin/logs');
    } else {
      router.replace('/admin/login');
    }
  }, [router]);

  return (
    <div className="py-8">
      <p className="text-gray-500">Redirecting...</p>
    </div>
  );
}
