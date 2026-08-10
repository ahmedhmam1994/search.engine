import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }

  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const required = [
    "NEXT_PUBLIC_GORGIAS_SUBDOMAIN",
    "GORGIAS_EMAIL",
    "GORGIAS_API_KEY",
    "AUTH_GOOGLE_ID",
    "AUTH_GOOGLE_SECRET",
    "AUTH_SECRET",
    "ALLOWED_EMAILS",
  ];
  const missing = required.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variable(s): ${missing.join(", ")}. See .env.example.`
    );
  }
}

// Automatically captures all unhandled server-side request errors.
export const onRequestError = Sentry.captureRequestError;
