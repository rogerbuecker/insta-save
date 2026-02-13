interface Env {
  API_SECRET?: string;
}

export const onRequest: PagesFunction<Env> = async (context) => {
  // If API_SECRET is not configured, allow all requests (local dev / open mode)
  const secret = context.env.API_SECRET;
  if (!secret) {
    return context.next();
  }

  // Always allow CORS preflight through without auth
  if (context.request.method === "OPTIONS") {
    return context.next();
  }

  // Check Authorization header
  const authHeader = context.request.headers.get("Authorization");
  if (authHeader === `Bearer ${secret}`) {
    return context.next();
  }

  return new Response(JSON.stringify({ error: "Unauthorized" }), {
    status: 401,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
};
