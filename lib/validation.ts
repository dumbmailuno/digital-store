import { z } from "zod";

/** One source of truth: used live in the browser AND again on the server. */

export const emailSchema = z
  .string()
  .trim()
  .min(1, "Enter your email address")
  .max(254, "That email is too long")
  .email("Enter a valid email, like name@example.com")
  .transform((v) => v.toLowerCase());

export const nameSchema = z
  .string()
  .trim()
  .min(2, "Enter your full name (at least 2 characters)")
  .max(100, "That name is too long");

export const PASSWORD_MIN_LENGTH = 8;

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Use at least ${PASSWORD_MIN_LENGTH} characters`)
  .max(128, "Password is too long")

export const registerSchema = z
  .object({
    fullName: nameSchema,
    email: emailSchema,
    password: passwordSchema,
    confirm: z.string(),
    acceptTerms: z.literal(true, { errorMap: () => ({ message: "You must accept the terms to continue" }) }),
  })
  .refine((d) => d.password === d.confirm, { path: ["confirm"], message: "Passwords don't match" });

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Enter your password"),
});

export type RegisterInput = z.infer<typeof registerSchema>;

/** Validate a single field so we can show its error while the user types. */
export function fieldError(schema: z.ZodTypeAny, value: unknown): string | null {
  const r = schema.safeParse(value);
  return r.success ? null : r.error.issues[0]?.message ?? "Invalid value";
}
