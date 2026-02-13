// PUT /api/posts/:id/metadata — update categories/notes for a post
interface Env {
  R2_BUCKET: R2Bucket;
}

async function readMetadata(bucket: R2Bucket) {
  const obj = await bucket.get("metadata.json");
  if (!obj) return { posts: {} as Record<string, any>, categories: [] as string[] };
  return obj.json<{ posts: Record<string, any>; categories: string[] }>();
}

async function writeMetadata(bucket: R2Bucket, metadata: any) {
  await bucket.put("metadata.json", JSON.stringify(metadata, null, 2), {
    httpMetadata: { contentType: "application/json" },
  });
}

export const onRequestPut: PagesFunction<Env> = async (context) => {
  const id = context.params.id as string;
  const { categories, notes } = await context.request.json<{ categories?: string[]; notes?: string }>();

  const metadata = await readMetadata(context.env.R2_BUCKET);

  if (!metadata.posts[id]) {
    metadata.posts[id] = {};
  }
  if (categories !== undefined) {
    metadata.posts[id].categories = Array.isArray(categories) ? categories : [];
  }
  if (notes !== undefined) {
    metadata.posts[id].notes = notes;
  }

  await writeMetadata(context.env.R2_BUCKET, metadata);
  return Response.json({ success: true, metadata: metadata.posts[id] }, { headers: corsHeaders() });
};

export const onRequestOptions: PagesFunction = async () => {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "PUT, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
};

function corsHeaders(): HeadersInit {
  return {
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json",
  };
}
