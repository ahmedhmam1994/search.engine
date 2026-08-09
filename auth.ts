import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

const allowedEmails = new Set(
  (process.env.ALLOWED_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
);

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google],
  trustHost: true,
  callbacks: {
    signIn({ user }) {
      return !!user.email && allowedEmails.has(user.email.toLowerCase());
    },
  },
  pages: { signIn: "/" },
});
