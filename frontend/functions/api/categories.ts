// GET /api/categories — return category list
// POST /api/categories — add a new category
interface Env {
  R2_BUCKET: R2Bucket;
}

async function readMetadata(bucket: R2Bucket) {
  const obj = await bucket.get("metadata.json");
  if (!obj) return { posts: {}, categories: [] };
  return obj.json<{ posts: Record<string, any>; categories: string[] }>();
}

async function writeMetadata(bucket: R2Bucket, metadata: any) {
  await bucket.put("metadata.json", JSON.stringify(metadata, null, 2), {
    httpMetadata: { contentType: "application/json" },
  });
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const metadata = await readMetadata(context.env.R2_BUCKET);
  return Response.json(metadata.categories || [], { headers: corsHeaders() });
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { category } = await context.request.json<{ category: string }>();
  if (!category || typeof category !== "string") {
    return Response.json({ error: "Category name is required" }, { status: 400, headers: corsHeaders() });
  }

  const metadata = await readMetadata(context.env.R2_BUCKET);
  if (!metadata.categories.includes(category)) {
    metadata.categories.push(category);
    await writeMetadata(context.env.R2_BUCKET, metadata);
  }

  return Response.json(metadata.categories, { headers: corsHeaders() });
};

export const onRequestOptions: PagesFunction = async () => {
  return new Response(null, { status: 204, headers: corsHeaders(true) });
};

function corsHeaders(preflight = false): HeadersInit {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json",
  };
  if (preflight) {
    headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS";
    headers["Access-Control-Allow-Headers"] = "Content-Type";
  }
  return headers;
}
