import React from 'react';
import { ArrowLeft, ArrowRight, Compass } from 'lucide-react';

type NotFoundPageProps = {
  onGoHome: () => void;
};

export const NotFoundPage: React.FC<NotFoundPageProps> = ({ onGoHome }) => (
  <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-100 via-brand-50 to-brand-100 px-6 py-12">
    <section className="w-full max-w-lg rounded-3xl border border-white/80 bg-white/85 p-8 text-center shadow-xl shadow-brand-900/10 backdrop-blur-xl sm:p-12">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-600 to-brand-500 text-white shadow-lg shadow-brand-600/20">
        <Compass className="h-8 w-8" aria-hidden="true" />
      </div>
      <p className="mt-7 text-sm font-bold uppercase tracking-[0.2em] text-brand-600">Flown</p>
      <h1 className="mt-3 text-5xl font-bold tracking-tight text-slate-900">404</h1>
      <h2 className="mt-3 text-xl font-bold text-slate-800">This page took a wrong turn.</h2>
      <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-slate-500">
        The page you are looking for does not exist or may have moved. Return to Communications to keep working.
      </p>
      <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
        <button type="button" onClick={() => window.history.back()} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 transition hover:border-brand-200 hover:text-brand-700">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Go back
        </button>
        <button type="button" onClick={onGoHome} className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-xs font-bold text-white shadow-lg shadow-brand-600/20 transition hover:bg-brand-700">
          Go to Communications <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </section>
  </main>
);
