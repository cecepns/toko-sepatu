import React from 'react';
import toast from 'react-hot-toast';

export function confirmToast(message) {
  return new Promise((resolve) => {
    toast.custom(
      (t) => (
        <div className="max-w-sm rounded-xl border border-slate-200 bg-white p-4 shadow-xl">
          <p className="mb-3 text-sm text-slate-800">{message}</p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              onClick={() => {
                toast.dismiss(t.id);
                resolve(false);
              }}
            >
              Batal
            </button>
            <button
              type="button"
              className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700"
              onClick={() => {
                toast.dismiss(t.id);
                resolve(true);
              }}
            >
              Ya
            </button>
          </div>
        </div>
      ),
      { duration: 20000 }
    );
  });
}
