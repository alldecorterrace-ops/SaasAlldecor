export function Feedback({
  error,
  success,
}: {
  error?: string;
  success?: string;
}) {
  if (error)
    return (
      <div
        role="alert"
        className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
      >
        {error}
      </div>
    );
  if (success)
    return (
      <div
        role="status"
        className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900"
      >
        {success}
      </div>
    );
  return null;
}
