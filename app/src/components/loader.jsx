export default function Loader({ className = "" }) {
  return (
    <div className={`inline-block h-6 w-6 animate-spin rounded-full border-2 border-slate-300 border-t-slate-700 ${className}`} aria-label="loading" />
  );
}
