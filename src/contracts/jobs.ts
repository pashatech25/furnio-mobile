import { z } from 'zod'

export const STAGE_SINGLE_CREDITS = 5
export const CREDITS_PER_FINAL_IMAGE = 5

export const twilightPresetSchema = z.enum(['pink_twilight', 'blue_hour', 'natural_dusk'])
export const exteriorEnhancementOptionSchema = z.enum(['clean_driveway', 'green_grass', 'blue_sky', 'remove_leaves'])

export const stageJobInputSchema = z.object({
  assetId: z.uuid(),
  batchItemId: z.uuid().optional(),
  direction: z.string().trim().max(600).default(''),
  mood: z.string().trim().max(80).default(''),
  roomType: z.string().trim().min(1).max(80),
  style: z.string().trim().max(80).default(''),
})

export const stageJobResponseSchema = z.object({
  accessLevel: z.enum(['paid', 'trial_locked']).default('paid'),
  billingMode: z.enum(['paid_credit', 'free_trial']).default('paid_credit'),
  creditsReserved: z.number().int().nonnegative(),
  jobId: z.uuid(),
  status: z.literal('queued'),
})

const workflowRegionSchema = z.object({
  bbox: z.object({
    height: z.number().min(0).max(1),
    width: z.number().min(0).max(1),
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
  }),
  instruction: z.string().trim().max(600).default(''),
  compositeMaskKey: z.string().min(1),
  maskKey: z.string().min(1),
  operation: z.enum(['remove', 'replace', 'restyle']),
  regionIndex: z.number().int().min(0).max(7),
})

export const maskEditJobInputSchema = z.object({
  assetId: z.uuid(),
  batchItemId: z.uuid().optional(),
  mode: z.enum(['remove', 'custom']),
  regions: z.array(workflowRegionSchema).min(1).max(8),
})

export const enhancementJobInputSchema = z.discriminatedUnion('feature', [
  z.object({
    assetId: z.uuid(),
    batchItemId: z.uuid().optional(),
    feature: z.literal('twilight'),
    preset: twilightPresetSchema,
  }),
  z.object({
    assetId: z.uuid(),
    batchItemId: z.uuid().optional(),
    feature: z.literal('winter_to_summer'),
  }),
  z.object({
    assetId: z.uuid(),
    batchItemId: z.uuid().optional(),
    feature: z.literal('exterior_enhancement'),
    options: z.array(exteriorEnhancementOptionSchema).min(1).max(4).refine(
      (options) => new Set(options).size === options.length,
      'Each enhancement may be selected only once',
    ),
  }),
])

export const floorplanJobInputSchema = z.object({
  assetId: z.uuid(),
  batchItemId: z.uuid().optional(),
})

export const MAX_REFERENCE_FURNITURE = 5

export const referenceFurniturePlacementSchema = z.object({
  furnitureAssetId: z.uuid(),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
})

export const referenceFurnitureJobInputSchema = z.object({
  assetId: z.uuid(),
  batchItemId: z.uuid().optional(),
  direction: z.string().trim().max(600).default(''),
  furnitureAssetIds: z.array(z.uuid()).min(1).max(MAX_REFERENCE_FURNITURE),
  placements: z.array(referenceFurniturePlacementSchema).min(1).max(MAX_REFERENCE_FURNITURE),
}).superRefine((value, ctx) => {
  if (new Set(value.furnitureAssetIds).size !== value.furnitureAssetIds.length) {
    ctx.addIssue({ code: 'custom', message: 'Each furniture photo must be unique', path: ['furnitureAssetIds'] })
  }
  if (value.furnitureAssetIds.includes(value.assetId)) {
    ctx.addIssue({ code: 'custom', message: 'Furniture photos must be separate from the room photo', path: ['furnitureAssetIds'] })
  }
  const placed = value.placements.map((placement) => placement.furnitureAssetId)
  if (new Set(placed).size !== placed.length) {
    ctx.addIssue({ code: 'custom', message: 'Each furniture photo may be placed once', path: ['placements'] })
  }
  if (placed.length !== value.furnitureAssetIds.length) {
    ctx.addIssue({ code: 'custom', message: 'Place every furniture photo exactly once', path: ['placements'] })
  }
  for (const [index, id] of placed.entries()) {
    if (!value.furnitureAssetIds.includes(id)) {
      ctx.addIssue({ code: 'custom', message: 'Placement must match an uploaded furniture photo', path: ['placements', index, 'furnitureAssetId'] })
    }
  }
})

export const multiViewJobInputSchema = z.object({
  anchorAssetId: z.uuid(),
  assetIds: z.array(z.uuid()).min(2).max(4),
  direction: z.string().trim().max(600).default(''),
  mood: z.string().trim().max(80).default(''),
  roomType: z.string().trim().min(1).max(80),
  style: z.string().trim().max(80).default(''),
}).superRefine((value, ctx) => {
  if (new Set(value.assetIds).size !== value.assetIds.length) {
    ctx.addIssue({ code: 'custom', message: 'Each view must be unique', path: ['assetIds'] })
  }
  if (!value.assetIds.includes(value.anchorAssetId)) {
    ctx.addIssue({ code: 'custom', message: 'Anchor must be one of the uploaded views', path: ['anchorAssetId'] })
  }
})

export const workflowJobResponseSchema = z.object({
  accessLevel: z.enum(['paid', 'trial_locked']).default('paid'),
  billingMode: z.enum(['paid_credit', 'free_trial']).default('paid_credit'),
  creditsReserved: z.number().int().nonnegative(),
  jobId: z.uuid(),
  status: z.literal('queued'),
})

export const recentJobResponseSchema = z.object({
  jobId: z.uuid(),
})

export const resultSourceSchema = z.object({
  assetId: z.uuid(),
  previewUrl: z.url(),
  expiresAt: z.iso.datetime({ offset: true }),
  viewIndex: z.number().int().min(0).max(3).nullable(),
})

export const workflowResultSchema = z.object({
  accessLevel: z.enum(['paid', 'trial_locked']).default('paid'),
  assetId: z.uuid(),
  resultUrl: z.url(),
  stepIndex: z.number().int().nonnegative(),
  source: resultSourceSchema.nullable().optional(),
})

export const jobStatusResponseSchema = z.object({
  accessLevel: z.enum(['paid', 'trial_locked']).default('paid'),
  billingMode: z.enum(['paid_credit', 'free_trial']).default('paid_credit'),
  error: z.string().nullable(),
  jobId: z.uuid(),
  previewExpiresAt: z.string().nullable(),
  previewUrl: z.url().nullable(),
  resultAssetId: z.uuid().nullable(),
  resultExpiresAt: z.string().nullable(),
  resultUrl: z.url().nullable(),
  status: z.enum(['queued', 'running', 'partial', 'succeeded', 'failed', 'cancelled']),
  progress: z.object({ done: z.number().int().nonnegative(), total: z.number().int().positive() }).optional(),
  results: z.array(workflowResultSchema).optional(),
})

export const creditBalanceResponseSchema = z.object({
  balance: z.number().int(),
})

export type StageJobInput = z.infer<typeof stageJobInputSchema>
export type StageJobResponse = z.infer<typeof stageJobResponseSchema>
export type JobStatusResponse = z.infer<typeof jobStatusResponseSchema>
export type MaskEditJobInput = z.infer<typeof maskEditJobInputSchema>
export type MultiViewJobInput = z.infer<typeof multiViewJobInputSchema>
export type EnhancementJobInput = z.infer<typeof enhancementJobInputSchema>
export type FloorplanJobInput = z.infer<typeof floorplanJobInputSchema>
export type ReferenceFurnitureJobInput = z.infer<typeof referenceFurnitureJobInputSchema>
export type TwilightPreset = z.infer<typeof twilightPresetSchema>
export type ExteriorEnhancementOption = z.infer<typeof exteriorEnhancementOptionSchema>
