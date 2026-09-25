import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-soft text-center">
      <h1 className="text-h1 text-ink">404</h1>
      <p className="text-muted">La página que buscas no existe.</p>
      <Link to="/" className="text-sm font-semibold text-primary hover:underline">
        Volver al inicio
      </Link>
    </div>
  );
}
