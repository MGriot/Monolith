interface PageSpinnerProps {
  label?: string;
  /** Fill the viewport (route-level) instead of sitting inline. */
  fullScreen?: boolean;
}

export function PageSpinner({ label = 'Loading…', fullScreen = false }: PageSpinnerProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex flex-col items-center justify-center text-slate-500 ${fullScreen ? 'min-h-screen' : 'py-24'}`}
    >
      <div className="mb-3 h-8 w-8 animate-spin rounded-full border-b-2 border-primary" aria-hidden="true" />
      <p>{label}</p>
    </div>
  );
}
