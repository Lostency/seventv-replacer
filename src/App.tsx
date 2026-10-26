import { createBrowserRouter, RouterProvider } from 'react-router';

const router = createBrowserRouter([
  { path: '/', element: <main>Seasonal Emote Replacer</main> },
]);

export function App() {
  return <RouterProvider router={router} />;
}
