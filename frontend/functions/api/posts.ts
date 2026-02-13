// GET /api/posts — returns posts-index.json from R2, merged with metadata
interface Env {
  R2_BUCKET: R2Bucket;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const bucket = context.env.R2_BUCKET;

  const [indexObj, metaObj] = await Promise.all([
    bucket.get("posts-index.json"),
    bucket.get("metadata.json"),
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
      // Prefix media URLs with R2 public base
      displayUrl: post.displayUrl ? `${mediaBase}/${post.displayUrl}` : "",
      videoUrl: post.videoUrl ? `${mediaBase}/${post.videoUrl}` : "",
      carouselItems: (post.carouselItems || []).map((item: any) => ({
        ...item,
        displayUrl: item.displayUrl ? `${mediaBase}/${item.displayUrl}` : "",
        videoUrl: item.videoUrl ? `${mediaBase}/${item.videoUrl}` : "",
      })),
    };
  });

  return Response.json(merged, { headers: corsHeaders() });
};

function corsHeaders(): HeadersInit {
  return {
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json",
  };
}
