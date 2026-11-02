import { createBrowserRouter, redirect } from 'react-router-dom';
import { createElement, lazy } from 'react';
import type { RouteObject } from 'react-router-dom';
import { RouteErrorBoundary } from '../components/RouteErrorBoundary';

const RootLayout = lazy(() => import('../components/RootLayout'));
const AnalyticBoard = lazy(() => import('@/modules/traffic/analytics/AnalyticBoard'));
const DiabloTrafficBoard = lazy(() => import('@/modules/traffic/diablo/DiabloTrafficBoard'));
const DiabloAiPlanningView = lazy(() => import('@/modules/traffic/diablo/DiabloAiPlanningView'));

const redirectLegacyRoom = ({ params }: { params: { projectId?: string } }) => {
  if (params.projectId === 'epoca-mvp') {
    return redirect('/diablo-board/ptm-mvp');
  }

  return null;
};

const redirectDiabloWeekView = ({ params }: { params: { projectId?: string; host?: string; wsPort?: string; httpPort?: string } }) => {
  const roomName = params.projectId === 'epoca-mvp' ? 'ptm-mvp' : params.projectId || 'ptm-mvp';
  if (params.host && params.wsPort && params.httpPort) {
    return redirect(`/server/${params.host}/${params.wsPort}/${params.httpPort}/diablo-board/${roomName}`);
  }

  return redirect(`/diablo-board/${roomName}`);
};

export const router = createBrowserRouter([
  {
    path: '/',
    Component: RootLayout,
    errorElement: createElement(RouteErrorBoundary),
    children: [
      {
        index: true,
        loader: () => redirect('/diablo-board/ptm-mvp'),
      },
      {
        path: '/board/:projectId',
        loader: redirectLegacyRoom,
        Component: AnalyticBoard,
      },
      {
        path: '/diablo-board/:projectId',
        loader: redirectLegacyRoom,
        Component: DiabloTrafficBoard,
      },
      {
        path: '/diablo-board/:projectId/ai-planning',
        loader: redirectLegacyRoom,
        Component: DiabloAiPlanningView,
      },
      {
        path: '/diablo-board/:projectId/week',
        loader: redirectDiabloWeekView,
      },
      {
        path: '/server/:host/:wsPort/:httpPort/board/:projectId',
        loader: redirectLegacyRoom,
        Component: AnalyticBoard,
      },
      {
        path: '/server/:host/:wsPort/:httpPort/diablo-board/:projectId',
        loader: redirectLegacyRoom,
        Component: DiabloTrafficBoard,
      },
      {
        path: '/server/:host/:wsPort/:httpPort/diablo-board/:projectId/ai-planning',
        loader: redirectLegacyRoom,
        Component: DiabloAiPlanningView,
      },
      {
        path: '/server/:host/:wsPort/:httpPort/diablo-board/:projectId/week',
        loader: redirectDiabloWeekView,
      },
      {
        path: '*',
        loader: () => redirect('/diablo-board/ptm-mvp'),
      },
    ],
  },
] satisfies RouteObject[]);
