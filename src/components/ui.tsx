import type { ComponentProps, ReactNode } from "react";

export function cx(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

const buttonStyles = {
  primary: "bg-brand text-white hover:bg-brand-dark",
  secondary: "border border-line bg-surface hover:bg-muted",
  danger: "border border-red-300 text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950",
  ghost: "hover:bg-muted",
};

export function Button({
  variant = "primary",
  className,
  ...props
}: ComponentProps<"button"> & { variant?: keyof typeof buttonStyles }) {
  return (
    <button
      className={cx(
        "inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50",
        buttonStyles[variant],
        className,
      )}
      {...props}
    />
  );
}

export function Input({ className, ...props }: ComponentProps<"input">) {
  return (
    <input
      className={cx(
        "w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20",
        className,
      )}
      {...props}
    />
  );
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return (
    <textarea
      className={cx(
        "w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20",
        className,
      )}
      {...props}
    />
  );
}

export function Select({ className, ...props }: ComponentProps<"select">) {
  return (
    <select
      className={cx(
        "w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20",
        className,
      )}
      {...props}
    />
  );
}

export function Field({
  label,
  name,
  errors,
  hint,
  children,
}: {
  label: string;
  name: string;
  errors?: string[];
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label htmlFor={name} className="block text-sm font-medium">
        {label}
      </label>
      {children}
      {hint && !errors?.length && <p className="text-xs text-subtle">{hint}</p>}
      {errors?.map((e) => (
        <p key={e} className="text-xs text-red-600 dark:text-red-400">
          {e}
        </p>
      ))}
    </div>
  );
}

export function Alert({ tone = "error", children }: { tone?: "error" | "success"; children: ReactNode }) {
  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      className={cx(
        "rounded-lg px-3 py-2 text-sm",
        tone === "error"
          ? "bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200"
          : "bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-200",
      )}
    >
      {children}
    </p>
  );
}

export function Card({ className, ...props }: ComponentProps<"div">) {
  return <div className={cx("rounded-xl border border-line bg-surface p-5", className)} {...props} />;
}

export function PageHeader({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-subtle">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("animate-pulse rounded-lg bg-muted", className)} />;
}

export function Badge({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cx("inline-flex rounded-full px-2 py-0.5 text-xs font-medium", className ?? "bg-muted")}>
      {children}
    </span>
  );
}
