import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-50 text-center">
      <h1 className="text-4xl font-extrabold text-slate-900">404</h1>
      <p className="text-slate-500">La página que buscas no existe.</p>
      <Link to="/" className="text-sm font-medium text-indigo-600 hover:underline">
        Volver al inicio
      </Link>
    </div>
  );
}
