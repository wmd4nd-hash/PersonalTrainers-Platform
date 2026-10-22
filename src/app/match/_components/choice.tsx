/** A large, tappable radio option for the quiz. */
export function Choice({
  name,
  value,
  label,
  hint,
  checked,
  required,
  id,
}: {
  name: string;
  value: string;
  label: string;
  hint?: string;
  checked?: boolean;
  required?: boolean;
  id?: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-line bg-surface p-3 text-sm hover:border-brand/60 has-[:checked]:border-brand has-[:checked]:bg-brand/5 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand/30">
      <input
        type="radio"
        id={id}
        name={name}
        value={value}
        defaultChecked={checked}
        required={required}
        className="mt-0.5 accent-brand"
      />
      <span>
        <span className="font-medium">{label}</span>
        {hint && <span className="block text-xs text-subtle">{hint}</span>}
      </span>
    </label>
  );
}
