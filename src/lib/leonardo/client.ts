const LEONARDO_API_BASE = 'https://cloud.leonardo.ai/api/rest/v1';

const MODEL_IDS: Record<string, string> = {
  'leonardo-phoenix': 'de7d3faf-762f-48e0-b3b7-9d0ac3a3fcf3',      // Leonardo Phoenix 1.0
  'leonardo-phoenix-0.9': '6b645e3a-d64f-4341-a6d8-7a3690fbf042',  // Leonardo Phoenix 0.9
  'leonardo-kino-xl': 'aa77f04e-3eec-4034-9c07-d0f619684628',      // Leonardo Kino XL
  'leonardo-lightning-xl': 'b24e16ff-06e3-43eb-8d33-4416c2d75876',  // Leonardo Lightning XL
};

const DEFAULT_MODEL_ID = MODEL_IDS['leonardo-phoenix'];

export class LeonardoApiError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public responseBody?: string
  ) {
    super(message);
    this.name = 'LeonardoApiError';
  }
}

function getApiKey(): string {
  const key = process.env.LEONARDO_API_KEY;
  if (!key) throw new Error('LEONARDO_API_KEY environment variable is not set');
  return key;
}

function getModelId(name?: string): string {
  if (!name) return DEFAULT_MODEL_ID;
  return MODEL_IDS[name] ?? DEFAULT_MODEL_ID;
}

export async function createGeneration(
  prompt: string,
  model?: string
): Promise<string> {
  const modelId = getModelId(model);
  const response = await fetch(`${LEONARDO_API_BASE}/generations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getApiKey()}`,
    },
    body: JSON.stringify({
      prompt,
      modelId,
      num_images: 1,
      width: 512,
      height: 512,
      guidance_scale: 7,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new LeonardoApiError(
      `Leonardo generation request failed: ${response.status}`,
      response.status,
      body
    );
  }

  const data = await response.json();
  const generationId =
    data.sdGenerationJob?.generationId ?? data.generationId;

  if (!generationId) {
    throw new LeonardoApiError(
      'Leonardo response missing generationId',
      response.status,
      JSON.stringify(data)
    );
  }

  return generationId;
}

const POLL_INTERVAL_MS = 3000;
const MAX_POLL_ATTEMPTS = 40; // ~2 minutes

export async function pollGeneration(
  generationId: string
): Promise<string> {
  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
    const response = await fetch(
      `${LEONARDO_API_BASE}/generations/${generationId}`,
      {
        headers: { Authorization: `Bearer ${getApiKey()}` },
      }
    );

    if (!response.ok) {
      const body = await response.text();
      throw new LeonardoApiError(
        `Leonardo poll failed: ${response.status}`,
        response.status,
        body
      );
    }

    const data = await response.json();
    const generation = data.generations_by_pk;

    if (generation?.status === 'COMPLETE') {
      const imageUrl = generation.generated_images?.[0]?.url;
      if (!imageUrl) {
        throw new LeonardoApiError(
          'Leonardo generation completed but no image URL found',
          200,
          JSON.stringify(data)
        );
      }
      return imageUrl;
    }

    if (generation?.status === 'FAILED') {
      throw new LeonardoApiError(
        'Leonardo generation failed',
        200,
        JSON.stringify(data)
      );
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  throw new LeonardoApiError(
    `Leonardo generation timed out after ${MAX_POLL_ATTEMPTS * POLL_INTERVAL_MS / 1000}s`,
    408
  );
}
