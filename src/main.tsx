import React from 'react';
import ReactDOM from 'react-dom/client';
import { Analytics } from '@vercel/analytics/react';
import App from './App';
import './index.css';
import { isSupabaseConfigured } from './lib/supabase';

const ConfigurationRequired: React.FC = () => (
  <main className="min-h-screen bg-slate-100 px-6 py-16 text-slate-900">
    <div className="mx-auto max-w-xl rounded-2xl bg-white p-8 shadow-sm">
      <p className="text-xs font-bold tracking-[0.2em] text-brand-600">Internal Ops</p>
      <h1 className="mt-3 text-2xl font-bold">Supabase configuration required</h1>
      <p className="mt-3 text-sm leading-6 text-slate-600">
        Add the Supabase project URL and anonymous key to the environment where this app is running, then restart or redeploy it.
      </p>
      <pre className="mt-5 overflow-x-auto rounded-lg bg-slate-900 p-4 text-xs leading-6 text-slate-100">
        VITE_SUPABASE_URL=https://your-project.supabase.co{'\n'}VITE_SUPABASE_ANON_KEY=your-anon-key
      </pre>
      <p className="mt-4 text-xs text-slate-500">
        For local development, put these values in <code>.env.local</code>. For production, add them to your hosting provider’s build environment variables.
      </p>
    </div>
  </main>
);

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <>
      {isSupabaseConfigured ? <App /> : <ConfigurationRequired />}
      <Analytics />
    </>
  </React.StrictMode>
);
