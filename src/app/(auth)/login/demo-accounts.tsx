"use client";

const accounts = [
  { email: "client@example.com", label: "Client", detail: "Has bookings, a package, a program and messages" },
  { email: "maya@example.com", label: "Trainer", detail: "Maya Okafor, strength coach in London" },
  { email: "admin@example.com", label: "Admin", detail: "Verification queue, users, bookings" },
];

const PASSWORD = "password123";

/** On the public demo: one click fills in a shared demo account. */
export function DemoAccounts() {
  function fill(email: string) {
    for (const [id, value] of [["email", email], ["password", PASSWORD]]) {
      const input = document.getElementById(id) as HTMLInputElement | null;
      if (input) input.value = value;
    }
    document.getElementById("password")?.focus();
  }

  return (
    <section aria-labelledby="demo-accounts" className="mt-6 space-y-2 border-t border-line pt-4">
      <h2 id="demo-accounts" className="text-sm font-semibold">
        Try a demo account
      </h2>
      <p className="text-xs text-subtle">
        Every demo account uses the password <code className="font-mono">{PASSWORD}</code>.
      </p>
      <ul className="space-y-2">
        {accounts.map((a) => (
          <li key={a.email}>
            <button
              type="button"
              onClick={() => fill(a.email)}
              className="w-full rounded-lg border border-line px-3 py-2 text-left text-sm hover:border-brand"
            >
              <span className="font-medium">{a.label}:</span> {a.email}
              <span className="block text-xs text-subtle">{a.detail}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
