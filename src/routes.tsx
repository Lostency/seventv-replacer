import type { RouteObject } from 'react-router';
import { Compare } from './pages/Compare';
import { Landing } from './pages/Landing';
import { Replace } from './pages/Replace';
import { Review } from './pages/Review';
import { TokenGuide } from './pages/TokenGuide';

export const routes: RouteObject[] = [
  { path: '/', element: <Landing /> },
  { path: '/guide/token', element: <TokenGuide /> },
  { path: '/replace', element: <Replace /> },
  { path: '/compare', element: <Compare /> },
  { path: '/review', element: <Review /> },
];
