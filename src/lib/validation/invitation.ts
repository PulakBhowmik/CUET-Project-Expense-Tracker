import { z } from "zod";

export const inviteMemberSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "Email is required")
    .max(254, "Email is too long"),
});

export type InviteMemberInput = z.infer<typeof inviteMemberSchema>;
