// PUT /api/posts/:id — update metadata (categories/notes)
// DELETE /api/posts/:id — delete post from R2
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

export const onRequestDelete: PagesFunction<Env> = async (context) => {
  const id = context.params.id as string;
  const bucket = context.env.R2_BUCKET;

  // Delete all files associated with this post
  const extensions = [".json", ".jpg", ".mp4"];
  const keysToDelete: string[] = [];

  for (const ext of extensions) {
    keysToDelete.push(`${id}${ext}`);
  }

  // Carousel items (up to 20)
  for (let i = 1; i <= 20; i++) {
    keysToDelete.push(`${id}_${i}.jpg`);
    keysToDelete.push(`${id}_${i}.mp4`);
  }

  // Delete in parallel, ignore missing keys
  await Promise.all(keysToDelete.map((key) => bucket.delete(key)));

  // Remove from metadata
  const metadata = await readMetadata(bucket);
  if (metadata.posts[id]) {
    delete metadata.posts[id];
    await writeMetadata(bucket, metadata);
  }

  // Rebuild the index after deletion
  const indexObj = await bucket.get("posts-index.json");
  if (indexObj) {
    const posts = await indexObj.json<any[]>();
    const filtered = posts.filter((p: any) => p.id !== id);
    await bucket.put("posts-index.json", JSON.stringify(filtered), {
      httpMetadata: { contentType: "application/json" },
    });
  }

  return Response.json({ success: true, message: "Post deleted" }, { headers: corsHeaders() });
};

export const onRequestOptions: PagesFunction = async () => {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, PUT, DELETE, OPTIONS",
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
