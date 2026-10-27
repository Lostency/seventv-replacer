import type { RouteObject } from 'react-router';
import { Landing } from './pages/Landing';
import { NotYet } from './pages/NotYet';

export const routes: RouteObject[] = [
  { path: '/', element: <Landing /> },
  { path: '/replace', element: <NotYet feature="Replace" /> },
  { path: '/compare', element: <NotYet feature="Compare" /> },
];
