// POST /api/duplicates/merge — merge metadata from deleteId into keepId, then delete
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

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { keepId, deleteId } = await context.request.json<{ keepId: string; deleteId: string }>();

  if (!keepId || !deleteId) {
    return Response.json(
      { error: "keepId and deleteId are required" },
      { status: 400, headers: corsHeaders() },
    );
  }

  const bucket = context.env.R2_BUCKET;
  const metadata = await readMetadata(bucket);

  const keepMeta = metadata.posts[keepId] || { categories: [], notes: "" };
  const deleteMeta = metadata.posts[deleteId] || { categories: [], notes: "" };

  // Union categories
  const mergedCategories = [...new Set([...(keepMeta.categories || []), ...(deleteMeta.categories || [])])];

  // Concatenate non-empty notes
  const mergedNotes = [keepMeta.notes, deleteMeta.notes]
    .filter((n: string) => n && n.trim())
    .join("\n---\n");

  metadata.posts[keepId] = { categories: mergedCategories, notes: mergedNotes };

  // Delete the duplicate post's files from R2
  const keysToDelete: string[] = [];
  for (const ext of [".json", ".jpg", ".mp4"]) {
    keysToDelete.push(`${deleteId}${ext}`);
  }
  for (let i = 1; i <= 20; i++) {
    keysToDelete.push(`${deleteId}_${i}.jpg`);
    keysToDelete.push(`${deleteId}_${i}.mp4`);
  }
  await Promise.all(keysToDelete.map((key) => bucket.delete(key)));

  // Remove deleted post from metadata
  delete metadata.posts[deleteId];
  await writeMetadata(bucket, metadata);

  // Remove deleted post from index
  const indexObj = await bucket.get("posts-index.json");
  if (indexObj) {
    const posts = await indexObj.json<any[]>();
    const filtered = posts.filter((p: any) => p.id !== deleteId);
    await bucket.put("posts-index.json", JSON.stringify(filtered), {
      httpMetadata: { contentType: "application/json" },
    });
  }

  return Response.json(
    { success: true, mergedCategories, mergedNotes },
    { headers: corsHeaders() },
  );
};

export const onRequestOptions: PagesFunction = async () => {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
};

function corsHeaders(): HeadersInit {
  return {
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json",
  };
}
