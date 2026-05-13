/** Shared classes for icon-only row actions (pair with `title` for accessibility). */
const base =
  'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border bg-white shadow-sm transition disabled:pointer-events-none disabled:opacity-40';

export const iconActionEdit = `${base} border-brand-200 text-brand-700 hover:bg-brand-50`;
export const iconActionDelete = `${base} border-red-200 text-red-600 hover:bg-red-50`;
export const iconActionToggleOff = `${base} border-amber-200 text-amber-700 hover:bg-amber-50`;
export const iconActionToggleOn = `${base} border-emerald-200 text-emerald-700 hover:bg-emerald-50`;
export const iconActionNeutral = `${base} border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900`;
