import type { RouteObject } from 'react-router';
import { Landing } from './pages/Landing';
import { NotYet } from './pages/NotYet';
import { TokenGuide } from './pages/TokenGuide';

export const routes: RouteObject[] = [
  { path: '/', element: <Landing /> },
  { path: '/guide/token', element: <TokenGuide /> },
  { path: '/replace', element: <NotYet feature="Replace" /> },
  { path: '/compare', element: <NotYet feature="Compare" /> },
];
