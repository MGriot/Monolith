import { Link } from "react-router-dom";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

interface AuthCardProps {
  title: string;
  description: string;
  children: React.ReactNode;
  /** Show the "Back to sign in" link (default). */
  showBackLink?: boolean;
}

/** Shared frame for the signed-out account pages (forgot / reset password, verify e-mail). */
export function AuthCard({ title, description, children, showBackLink = true }: AuthCardProps) {
  return (
    <div className="flex items-center justify-center min-h-screen bg-subtle p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold">{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>{children}</CardContent>
        {showBackLink && (
          <CardFooter>
            <Link to="/login" className="text-sm text-primary hover:underline">
              Back to sign in
            </Link>
          </CardFooter>
        )}
      </Card>
    </div>
  );
}

export function errorMessage(error: unknown, fallback: string): string {
  const e = error as { response?: { data?: { detail?: unknown } } };
  const detail = e?.response?.data?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail) && detail[0]?.msg) return String(detail[0].msg);
  return fallback;
}
