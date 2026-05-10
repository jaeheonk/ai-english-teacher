import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextRequest, NextResponse } from "next/server";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

// Fallback model chain: try each in order if higher-priority model is unavailable
const MODEL_CHAIN = [
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-flash-latest",
  "gemini-2.0-flash-lite",
];

const RETRYABLE_STATUSES = [429, 500, 503];

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function generateWithFallback(prompt: string) {
  let lastError: Error | null = null;

  for (const modelName of MODEL_CHAIN) {
    const model = genAI.getGenerativeModel({ model: modelName });

    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        console.log(`[analyze-text] Trying ${modelName} (attempt ${attempt})`);
        const result = await model.generateContent([prompt]);
        console.log(`[analyze-text] Success with ${modelName}`);
        return result;
      } catch (err: unknown) {
        const error = err as Error & { status?: number };
        const status = error?.status;
        const isRetryable = status != null && RETRYABLE_STATUSES.includes(status);

        console.warn(
          `[analyze-text] ${modelName} attempt ${attempt} failed (status=${status}): ${error.message?.slice(0, 100)}`
        );

        lastError = error;

        if (!isRetryable) break; // Non-retryable → skip to next model immediately
        if (attempt < 2) await sleep(2000); // Brief pause before retry
      }
    }
  }

  throw lastError ?? new Error("All models failed");
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { text, level = "middle" } = body;

    if (!text || typeof text !== "string") {
      return NextResponse.json({ error: "No text provided" }, { status: 400 });
    }

    let levelDescription = "Middle school level (Intermediate)";
    if (level === "elementary") levelDescription = "Elementary school level (Beginner)";
    else if (level === "high") levelDescription = "High school/College level (Advanced)";
    else if (level === "native") levelDescription = "Native speaker level (Fluent/Expert)";

    const prompt = `You are an expert English teacher.

Your student's target English proficiency level is: ${levelDescription}.

Your task:
1. Analyze the grammar of the provided text and correct any errors. PLEASE adjust the strictness of your corrections and the complexity of your grammar explanations to match the student's target proficiency level (${levelDescription}).
2. Explain the corrections in clear, simple Korean.

The original text is:
"${text}"

Respond STRICTLY in the following JSON format with NO extra text, NO markdown, NO code fences — raw JSON only:
{
  "original": "The exact text you were provided, word for word",
  "corrected": "The grammatically corrected version of the text, matching the ${levelDescription}",
  "explanations": [
    {
      "error": "The specific error found (quote the original wrong part)",
      "correction": "What it was changed to",
      "reason": "Simple Korean explanation of why this is wrong and how to fix it, tailored to the ${levelDescription}"
    }
  ],
  "overall_feedback": "Overall feedback about the writing in Korean (1-2 sentences, encouraging tone), considering their level is ${levelDescription}"
}

If there are no grammar errors, set "explanations" to an empty array [].`;

    const result = await generateWithFallback(prompt);

    const response = await result.response;
    let responseText = response.text().trim();

    // Strip markdown code fences if present
    responseText = responseText
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/```\s*$/i, "")
      .trim();

    // Extract JSON object even if model adds surrounding text
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error(
        "모델이 유효한 JSON을 반환하지 않았습니다. 다시 시도해 주세요."
      );
    }

    const parsed = JSON.parse(jsonMatch[0]);

    return NextResponse.json(parsed);
  } catch (error) {
    console.error("Gemini API error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to analyze the text",
      },
      { status: 500 }
    );
  }
}
