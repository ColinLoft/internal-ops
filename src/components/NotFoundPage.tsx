import React from 'react';
import { ArrowLeft, ArrowRight, Compass } from 'lucide-react';

type NotFoundPageProps = {
  onGoHome: () => void;
};

export const NotFoundPage: React.FC<NotFoundPageProps> = ({ onGoHome }) => (
  <main className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto bg-black px-6 py-12">
    <section className="w-full max-w-lg text-center">
      <Compass className="mx-auto h-10 w-10 text-brand-500" aria-hidden="true" />
      <h1 className="mt-6 text-5xl font-bold tracking-tight text-white">Page not found</h1>
      <p className="mx-auto mt-4 max-w-sm text-base leading-7 text-slate-300">
        This Flown Ops page does not exist or has moved. Use the rail on the left, or head back home.
      </p>
      <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
        <button type="button" onClick={() => window.history.back()} className="inline-flex items-center justify-center gap-2 rounded-full bg-white/10 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-white/15">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Go back
        </button>
        <button type="button" onClick={onGoHome} className="inline-flex items-center justify-center gap-2 rounded-full bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700">
          Go to Home <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </section>
  </main>
);
