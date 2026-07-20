import { z } from "zod";

export const createProjectSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Project name must be at least 2 characters.")
    .max(80, "Project name must be at most 80 characters."),
});

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
