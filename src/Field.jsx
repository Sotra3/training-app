export default function Field({ label, children }) {
  return (
    <label className="block mb-2">
      <span className="text-xs font-bold uppercase tracking-wide text-neutral-500">{label}</span>
      {children}
    </label>
  );
}
