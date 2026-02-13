// GET /api/accounts — return available account names from R2
interface Env {
  R2_BUCKET: R2Bucket;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const obj = await context.env.R2_BUCKET.get("accounts.json");
  if (!obj) {
    return Response.json([], { headers: corsHeaders() });
  }
  const accounts = await obj.json();
  return Response.json(accounts, { headers: corsHeaders() });
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
