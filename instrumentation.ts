export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const required = [
    "CODEWORDS_API_KEY",
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
