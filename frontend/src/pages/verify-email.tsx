import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import api from "@/lib/api";
import { AuthCard, errorMessage } from "@/components/auth-card";

type State = { kind: "working" } | { kind: "ok" } | { kind: "error"; message: string };

export default function VerifyEmailPage() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const [state, setState] = useState<State>(token ? { kind: "working" } : { kind: "error", message: "The link is incomplete." });
  const started = useRef(false);

  useEffect(() => {
    if (!token || started.current) return; // StrictMode runs effects twice; verify once
    started.current = true;
    api
      .post("/auth/verify-email", { token })
      .then(() => setState({ kind: "ok" }))
      .catch((err) => setState({ kind: "error", message: errorMessage(err, "The link is invalid or has expired.") }));
  }, [token]);

  return (
    <AuthCard
      title="E-mail verification"
      description={state.kind === "working" ? "Checking your link..." : state.kind === "ok" ? "All set." : "That did not work."}
      showBackLink={false}
    >
      {state.kind === "working" && (
        <p role="status" className="text-sm text-slate-600">
          One moment...
        </p>
      )}
      {state.kind === "ok" && (
        <p role="status" className="text-sm text-slate-700">
          Your e-mail address is verified. <Link to="/" className="text-primary hover:underline">Continue to the app</Link>
        </p>
      )}
      {state.kind === "error" && (
        <div role="alert" className="space-y-2 text-sm">
          <p className="text-destructive">{state.message}</p>
          <p className="text-slate-600">
            Sign in and use <b>Settings &rsaquo; Notifications</b> to send a new verification e-mail.{" "}
            <Link to="/login" className="text-primary hover:underline">Sign in</Link>
          </p>
        </div>
      )}
    </AuthCard>
  );
}
