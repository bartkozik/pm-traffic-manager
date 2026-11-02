import { Suspense } from 'react';
import { Outlet } from 'react-router-dom';

export default function RootLayout() {
  return (
    <div className="app">
      <Suspense fallback={<div>Loading...</div>}>
        <Outlet />
      </Suspense>
    </div>
  );
}
