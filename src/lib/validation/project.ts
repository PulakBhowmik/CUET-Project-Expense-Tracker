import { z } from "zod";

export const createProjectSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Project name must be at least 2 characters.")
    .max(80, "Project name must be at most 80 characters."),
});

export type CreateProjectInput = z.infer<typeof createProjectSchema>;

export const renameProjectSchema = createProjectSchema;
export type RenameProjectInput = z.infer<typeof renameProjectSchema>;

export const transferLeadershipSchema = z.object({
  targetUserId: z.string().min(1, "Choose a member to transfer leadership to."),
});

export const deleteProjectSchema = z.object({
  /** The user must type the exact project name to confirm deletion. */
  confirmationName: z.string().min(1, "Type the project name to confirm."),
});
