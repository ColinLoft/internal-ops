import React from 'react';

export const FormBrand: React.FC = () => (
  <a href="https://flown.org" target="_blank" rel="noopener noreferrer" aria-label="Flown website" className="inline-flex min-h-11 items-center gap-3">
    <span className="rounded-lg bg-black px-3 py-2"><img src="/flown-logo.png" alt="Flown" className="h-9 w-auto brightness-0 invert" /></span>
    <span className="text-sm text-slate-500">flown.org</span>
  </a>
);
