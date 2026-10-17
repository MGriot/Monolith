import { useState } from "react";
import { Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { MailCheck } from "lucide-react";
import api from "@/lib/api";
import { useLoginConfig } from "@/lib/login-config";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const requestSchema = z.object({
  full_name: z.string().trim().min(2, "Full name must be at least 2 characters"),
  email: z.string().email("Invalid email address"),
});

type RequestFormValues = z.infer<typeof requestSchema>;

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-center min-h-screen bg-slate-50 px-4">
      <Card className="w-full max-w-md">{children}</Card>
    </div>
  );
}

function errorMessage(err: any): string {
  if (err.response?.status === 429) return "Too many requests. Please try again later.";
  const detail = err.response?.data?.detail;
  return typeof detail === "string" ? detail : "Failed to send the request. Please try again.";
}

export default function RegisterPage() {
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const { config, loaded } = useLoginConfig();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RequestFormValues>({ resolver: zodResolver(requestSchema) });

  const onSubmit = async (data: RequestFormValues) => {
    setIsLoading(true);
    setError(null);
    try {
      await api.post("/auth/register-request", { email: data.email.trim(), full_name: data.full_name });
      setSentTo(data.email.trim());
    } catch (err: any) {
      setError(errorMessage(err));
    } finally {
      setIsLoading(false);
    }
  };

  if (loaded && !config.allow_signup) {
    return (
      <Shell>
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold">Registration is closed</CardTitle>
          <CardDescription>
            New accounts are created by an administrator. Ask yours to add you, then log in.
          </CardDescription>
        </CardHeader>
        <CardFooter>
          <Link to="/login" className="text-sm text-primary hover:underline">
            Back to login
          </Link>
        </CardFooter>
      </Shell>
    );
  }

  if (sentTo) {
    return (
      <Shell>
        <CardHeader className="space-y-1">
          <MailCheck className="h-8 w-8 text-primary" aria-hidden="true" />
          <CardTitle className="text-2xl font-bold">Request sent</CardTitle>
          <CardDescription>
            An administrator will review your request. Once approved, we'll e-mail a temporary password to{" "}
            <span className="font-medium text-slate-900">{sentTo}</span>. You will choose your own password the
            first time you sign in.
          </CardDescription>
        </CardHeader>
        <CardFooter>
          <Link to="/login" className="text-sm text-primary hover:underline">
            Back to login
          </Link>
        </CardFooter>
      </Shell>
    );
  }

  return (
    <Shell>
      <CardHeader className="space-y-1">
        <CardTitle className="text-2xl font-bold">Request an account</CardTitle>
        <CardDescription>
          An administrator approves every account, then e-mails you a temporary password.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          {error && (
            <div role="alert" className="p-3 text-sm text-white bg-destructive rounded-md">
              {error}
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="full_name">Full Name</Label>
            <Input id="full_name" autoComplete="name" autoFocus placeholder="John Doe" {...register("full_name")} />
            {errors.full_name && <p className="text-sm text-destructive">{errors.full_name.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="m@example.com"
              {...register("email")}
            />
            {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
          </div>
          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? "Sending..." : "Request account"}
          </Button>
        </form>
      </CardContent>
      <CardFooter className="flex flex-col space-y-2">
        <div className="text-sm text-muted-foreground text-center">
          Already have an account?{" "}
          <Link to="/login" className="text-primary hover:underline">
            Login
          </Link>
        </div>
      </CardFooter>
    </Shell>
  );
}
