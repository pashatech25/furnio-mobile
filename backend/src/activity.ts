import { z } from "zod";
import { NativeDatabase } from "./native-events";
import { HttpError } from "./http";
export const activityResult = z.object({
  items: z.array(
    z.object({
      id: z.uuid(),
      projectId: z.uuid().nullable(),
      projectName: z.string().nullable(),
      createdAt: z.iso.datetime({ offset: true }),
      status: z.enum([
        "queued",
        "running",
        "partial",
        "succeeded",
        "failed",
        "cancelled",
      ]),
      archived: z.boolean(),
      featureSlug: z.string(),
    }),
  ),
  nextCursor: z
    .object({ createdAt: z.iso.datetime({ offset: true }), id: z.uuid() })
    .nullable(),
});
export async function getActivity(userId: string, url: URL, env: Env) {
  const cursor = z
    .object({
      at: z.iso.datetime({ offset: true }).nullable(),
      id: z.uuid().nullable(),
    })
    .refine((v) => (v.at === null) === (v.id === null))
    .safeParse({
      at: url.searchParams.get("beforeAt"),
      id: url.searchParams.get("beforeId"),
    });
  if (!cursor.success)
    throw new HttpError(
      400,
      "This activity page link is invalid. Refresh activity.",
    );
  return new NativeDatabase(env).rpc(
    "get_mobile_activity",
    {
      p_user: userId,
      p_before_at: cursor.data.at,
      p_before_id: cursor.data.id,
      p_limit: 25,
    },
    activityResult,
  );
}
