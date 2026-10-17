import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import api from "@/lib/api";
import { AuthCard, errorMessage } from "@/components/auth-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const MIN_LENGTH = 8;

export default function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tooShort = password.length > 0 && password.length < MIN_LENGTH;
  const mismatch = confirm.length > 0 && confirm !== password;
  const canSubmit = !!token && password.length >= MIN_LENGTH && password === confirm && !busy;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      await api.post("/auth/reset-password", { token, new_password: password });
      setDone(true);
    } catch (err) {
      setError(errorMessage(err, "Could not reset the password."));
    } finally {
      setBusy(false);
    }
  };

  if (!token) {
    return (
      <AuthCard title="Reset link missing" description="Open the link from your e-mail again, or request a new one.">
        <Link to="/forgot-password" className="text-sm text-primary hover:underline">
          Request a new reset link
        </Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Choose a new password" description={`At least ${MIN_LENGTH} characters.`} showBackLink={!done}>
      {done ? (
        <div className="space-y-3">
          <p role="status" className="text-sm text-slate-700">
            Your password was changed.
          </p>
          <Link to="/login" className="inline-block text-sm text-primary hover:underline">
            Sign in with your new password
          </Link>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          {error && (
            <div role="alert" className="p-3 text-sm text-white bg-destructive rounded-md">
              {error}{" "}
              <Link to="/forgot-password" className="underline">
                Request a new link
              </Link>
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="new-password">New password</Label>
            <Input
              id="new-password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={tooShort}
            />
            {tooShort && <p className="text-sm text-destructive">Use at least {MIN_LENGTH} characters.</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm-password">Confirm new password</Label>
            <Input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              aria-invalid={mismatch}
            />
            {mismatch && <p className="text-sm text-destructive">The passwords do not match.</p>}
          </div>
          <Button type="submit" className="w-full" disabled={!canSubmit}>
            {busy ? "Saving..." : "Change password"}
          </Button>
        </form>
      )}
    </AuthCard>
  );
}
