import { z } from 'zod'

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024
export const MAX_MASK_BYTES = 5 * 1024 * 1024
export const UPLOAD_URL_TTL_SECONDS = 15 * 60
export const PREVIEW_URL_TTL_SECONDS = 5 * 60

export const sourceContentTypeSchema = z.enum(['image/jpeg', 'application/pdf'])

export const presignUploadSchema = z.object({
  assetId: z.uuid().optional(),
  batchItemId: z.uuid().optional(),
  contentLength: z.number().int().positive().max(MAX_UPLOAD_BYTES),
  contentType: sourceContentTypeSchema,
  fileName: z.string().trim().min(1).max(255),
  featureSlug: z.enum(['virtual_staging', 'multiview', 'item_removal', 'custom_staging', 'twilight', 'winter_to_summer', 'exterior_enhancement', 'floor_plan', 'reference_furniture']),
  outputCount: z.number().int().min(1).max(4).default(1),
  projectId: z.uuid(),
  roomGroupId: z.uuid().nullable().optional(),
  viewIndex: z.number().int().min(0).max(3).nullable().optional(),
  isAnchor: z.boolean().default(false),
  countsTowardPhotoLimit: z.boolean().default(true),
}).superRefine((value, ctx) => {
  if (value.contentType === 'application/pdf' && value.featureSlug !== 'floor_plan') {
    ctx.addIssue({ code: 'custom', message: 'PDF uploads are only allowed for 3D floor plan', path: ['contentType'] })
  }
  if (value.featureSlug !== 'floor_plan' && value.contentType !== 'image/jpeg') {
    ctx.addIssue({ code: 'custom', message: 'Upload must be a JPEG', path: ['contentType'] })
  }
})

export const batchFeatureSchema = z.enum([
  'stage',
  'remove',
  'custom',
  'twilight',
  'winter-to-summer',
  'exterior-enhancement',
  'floor-plan',
])

export const reserveBatchSchema = z.object({
  featureSlug: batchFeatureSchema,
  files: z.array(z.object({
    contentLength: z.number().int().positive().max(MAX_UPLOAD_BYTES),
    contentType: sourceContentTypeSchema,
    fileName: z.string().trim().min(1).max(255),
    settings: z.record(z.string(), z.unknown()).default({}),
  })).min(1).max(50),
  idempotencyKey: z.string().trim().min(16).max(200),
  projectId: z.uuid(),
  settings: z.record(z.string(), z.unknown()).default({}),
}).superRefine((value, ctx) => {
  if (value.featureSlug !== 'floor-plan' && value.files.some((file) => file.contentType !== 'image/jpeg')) {
    ctx.addIssue({ code: 'custom', message: 'Every batch item must be a JPEG', path: ['files'] })
  }
})

export const reserveBatchResponseSchema = z.object({
  batchId: z.uuid(),
  creditsReserved: z.number().int().positive(),
  projectPhotoCountBefore: z.number().int().nonnegative(),
  projectPhotoLimit: z.number().int().positive(),
  reservationExpiresAt: z.string(),
  items: z.array(z.object({
    assetId: z.uuid(),
    contentLength: z.number().int().positive(),
    expiresAt: z.string(),
    fileName: z.string(),
    headers: z.record(z.string(), z.string()),
    itemId: z.uuid(),
    position: z.number().int().nonnegative(),
    uploadUrl: z.url(),
  })),
})

export const presignMaskSchema = z.object({
  batchItemId: z.uuid().optional(),
  contentLength: z.number().int().positive().max(MAX_MASK_BYTES),
  contentType: z.literal('image/png'),
  featureSlug: z.enum(['item_removal', 'custom_staging']),
})

export const presignMaskResponseSchema = z.object({
  expiresAt: z.string(),
  headers: z.record(z.string(), z.string()),
  maskKey: z.string().min(1),
  uploadUrl: z.url(),
})

export const presignUploadResponseSchema = z.object({
  assetId: z.uuid(),
  expiresAt: z.string(),
  headers: z.record(z.string(), z.string()),
  uploadUrl: z.url(),
})

export const completeUploadResponseSchema = z.object({
  assetId: z.uuid(),
  contentType: sourceContentTypeSchema.optional(),
  height: z.number().int().positive().nullable(),
  previewExpiresAt: z.string().nullable(),
  previewUrl: z.url().nullable(),
  status: z.literal('ready'),
  width: z.number().int().positive().nullable(),
})

export type PresignUploadInput = z.infer<typeof presignUploadSchema>
export type PresignUploadResponse = z.infer<typeof presignUploadResponseSchema>
export type CompleteUploadResponse = z.infer<typeof completeUploadResponseSchema>
export type PresignMaskResponse = z.infer<typeof presignMaskResponseSchema>
export type ReserveBatchInput = z.infer<typeof reserveBatchSchema>
export type ReserveBatchResponse = z.infer<typeof reserveBatchResponseSchema>
