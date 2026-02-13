// GET /api/posts/:id — return a single post from the index
// DELETE /api/posts/:id — delete post from R2
interface Env {
  R2_BUCKET: R2Bucket;
  R2_PUBLIC_URL: string;
}

function getAccount(request: Request): string | null {
  return new URL(request.url).searchParams.get("account");
}

async function readMetadata(bucket: R2Bucket, account: string) {
  const obj = await bucket.get(`${account}/metadata.json`);
  if (!obj) return { posts: {} as Record<string, any>, categories: [] as string[] };
  return obj.json<{ posts: Record<string, any>; categories: string[] }>();
}

async function writeMetadata(bucket: R2Bucket, account: string, metadata: any) {
  await bucket.put(`${account}/metadata.json`, JSON.stringify(metadata, null, 2), {
    httpMetadata: { contentType: "application/json" },
  });
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const account = getAccount(context.request);
  if (!account) {
    return Response.json({ error: "account parameter is required" }, { status: 400, headers: corsHeaders() });
  }

  const id = context.params.id as string;
  const bucket = context.env.R2_BUCKET;

  const indexObj = await bucket.get(`${account}/posts-index.json`);
  if (!indexObj) {
    return Response.json({ error: "Post not found" }, { status: 404, headers: corsHeaders() });
  }

  const posts = await indexObj.json<any[]>();
  const post = posts.find((p: any) => p.id === id);
  if (!post) {
    return Response.json({ error: "Post not found" }, { status: 404, headers: corsHeaders() });
  }

  const metadata = await readMetadata(bucket, account);
  const postMeta = metadata.posts[id] || { categories: [], notes: "" };
  const mediaBase = context.env.R2_PUBLIC_URL || "";

  const merged = {
    ...post,
    categories: postMeta.categories || [],
    notes: postMeta.notes || "",
    displayUrl: post.displayUrl ? `${mediaBase}/${account}/${post.displayUrl}` : "",
    videoUrl: post.videoUrl ? `${mediaBase}/${account}/${post.videoUrl}` : "",
    carouselItems: (post.carouselItems || []).map((item: any) => ({
      ...item,
      displayUrl: item.displayUrl ? `${mediaBase}/${account}/${item.displayUrl}` : "",
      videoUrl: item.videoUrl ? `${mediaBase}/${account}/${item.videoUrl}` : "",
    })),
  };

  return Response.json(merged, { headers: corsHeaders() });
};

export const onRequestDelete: PagesFunction<Env> = async (context) => {
  const account = getAccount(context.request);
  if (!account) {
    return Response.json({ error: "account parameter is required" }, { status: 400, headers: corsHeaders() });
  }

  const id = context.params.id as string;
  const bucket = context.env.R2_BUCKET;

  // Delete all files associated with this post
  const keysToDelete: string[] = [];
  for (const ext of [".json", ".jpg", ".mp4"]) {
    keysToDelete.push(`${account}/${id}${ext}`);
  }
  for (let i = 1; i <= 20; i++) {
    keysToDelete.push(`${account}/${id}_${i}.jpg`);
    keysToDelete.push(`${account}/${id}_${i}.mp4`);
  }

  await Promise.all(keysToDelete.map((key) => bucket.delete(key)));

  // Remove from metadata
  const metadata = await readMetadata(bucket, account);
  if (metadata.posts[id]) {
    delete metadata.posts[id];
    await writeMetadata(bucket, account, metadata);
  }

  // Remove from index
  const indexObj = await bucket.get(`${account}/posts-index.json`);
  if (indexObj) {
    const posts = await indexObj.json<any[]>();
    const filtered = posts.filter((p: any) => p.id !== id);
    await bucket.put(`${account}/posts-index.json`, JSON.stringify(filtered), {
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
      "Access-Control-Allow-Methods": "GET, DELETE, OPTIONS",
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
