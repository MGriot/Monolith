import { useState } from "react";
import api from "@/lib/api";
import { AuthCard, errorMessage } from "@/components/auth-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post("/auth/forgot-password", { email: email.trim() });
      setDone(true);
    } catch (err) {
      setError(errorMessage(err, "Could not send the reset link. Try again later."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthCard title="Forgot your password?" description="Enter your e-mail address and we will send you a reset link.">
      {done ? (
        <p role="status" className="text-sm text-fg-body">
          If an account exists for <b>{email}</b>, a reset link is on its way. It is valid for a short time and works
          once. Check your spam folder if it does not arrive.
        </p>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          {error && (
            <div role="alert" className="p-3 text-sm text-white bg-destructive rounded-md">
              {error}
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="m@example.com"
            />
          </div>
          <Button type="submit" className="w-full" disabled={busy || !email.trim()}>
            {busy ? "Sending..." : "Send reset link"}
          </Button>
        </form>
      )}
    </AuthCard>
  );
}
