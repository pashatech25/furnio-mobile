import { z } from 'zod'

export const authUserSchema = z.object({
  userId: z.uuid(),
  email: z.email(),
})

export type AuthUser = z.infer<typeof authUserSchema>

export const meResponseSchema = z.object({
  user: authUserSchema,
})

export type MeResponse = z.infer<typeof meResponseSchema>

export const apiErrorSchema = z.object({
  error: z.string(),
})

export type ApiError = z.infer<typeof apiErrorSchema>

