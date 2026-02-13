// GET /api/posts/:id/suggest-categories — keyword-based category suggestions
interface Env {
  R2_BUCKET: R2Bucket;
}

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  Recipes: ["recipe", "cook", "food", "ingredient", "meal", "bake", "#recipe", "#cooking", "#food", "#foodie", "#yummy"],
  DIY: ["diy", "craft", "make", "build", "handmade", "#diy", "#craft", "#handmade", "#crafts", "selbstgemacht"],
  Tutorial: ["tutorial", "how to", "guide", "step", "learn", "#tutorial", "anleitung", "lernen"],
  Funny: ["funny", "hilarious", "laugh", "humor", "comedy", "#funny", "#meme", "#lol", "lustig"],
  Ideas: ["idea", "inspiration", "creative", "#inspo", "#ideas", "idee"],
  Projects: ["project", "build", "design", "#project", "projekt"],
  Inspiration: ["inspiration", "inspire", "beautiful", "#inspiration", "#inspo", "inspired"],
};

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const id = context.params.id as string;
  const bucket = context.env.R2_BUCKET;

  const indexObj = await bucket.get("posts-index.json");
  if (!indexObj) {
    return Response.json({ error: "Post not found" }, { status: 404, headers: corsHeaders() });
  }

  const posts = await indexObj.json<any[]>();
  const post = posts.find((p: any) => p.id === id);
  if (!post) {
    return Response.json({ error: "Post not found" }, { status: 404, headers: corsHeaders() });
  }

  const caption: string = post.caption || "";
  const hashtags: string[] = post.hashtags || [];
  const text = (caption + " " + hashtags.join(" ")).toLowerCase();

  const suggestions: { category: string; confidence: number; matchedKeywords: string[] }[] = [];
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    const matches = keywords.filter((kw) => text.includes(kw.toLowerCase()));
    if (matches.length > 0) {
      suggestions.push({
        category,
        confidence: Math.min(100, matches.length * 30),
        matchedKeywords: matches.slice(0, 3),
      });
    }
  }

  suggestions.sort((a, b) => b.confidence - a.confidence);
  return Response.json(suggestions.slice(0, 3), { headers: corsHeaders() });
};

export const onRequestOptions: PagesFunction = async () => {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
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
