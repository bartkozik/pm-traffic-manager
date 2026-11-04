import { Suspense } from 'react';
import { Outlet } from 'react-router-dom';
import { demoEnabled } from '@/modules/demo/demoRuntime';
import { DemoLayout } from '@/modules/demo/DemoLayout';

export default function RootLayout() {
  if (demoEnabled) return <DemoLayout />;
  return (
    <div className="app">
      <Suspense fallback={<div>Loading...</div>}>
        <Outlet />
      </Suspense>
    </div>
  );
}
