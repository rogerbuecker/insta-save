// GET /api/posts — returns posts-index.json from R2, merged with metadata
interface Env {
  R2_BUCKET: R2Bucket;
  R2_PUBLIC_URL: string;
}

function getAccount(request: Request): string | null {
  return new URL(request.url).searchParams.get("account");
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const account = getAccount(context.request);
  if (!account) {
    return Response.json({ error: "account parameter is required" }, { status: 400, headers: corsHeaders() });
  }

  const bucket = context.env.R2_BUCKET;

  const [indexObj, metaObj] = await Promise.all([
    bucket.get(`${account}/posts-index.json`),
    bucket.get(`${account}/metadata.json`),
  ]);

  if (!indexObj) {
    return Response.json([], { headers: corsHeaders() });
  }

  const posts = await indexObj.json<any[]>();
  let metadata: { posts: Record<string, any>; categories: string[] } = { posts: {}, categories: [] };

  if (metaObj) {
    metadata = await metaObj.json();
  }

  // Merge user metadata (categories/notes) into each post
  const mediaBase = context.env.R2_PUBLIC_URL || "";
  const merged = posts.map((post: any) => {
    const postMeta = metadata.posts[post.id] || { categories: [], notes: "" };
    return {
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
  });

  return Response.json(merged, { headers: corsHeaders() });
};

export const onRequestOptions: PagesFunction = async () => {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
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
