/**
 * Azure OpenAI Image Generation Adapter
 *
 * Uses the Azure OpenAI Images API with api-key header auth.
 * Endpoint: {baseUrl}/images/generations
 */

import type {
  ImageGenerationConfig,
  ImageGenerationOptions,
  ImageGenerationResult,
} from '../types';

const DEFAULT_MODEL = 'dall-e-3';
const DEFAULT_BASE_URL = 'https://your-resource.openai.azure.com/openai/v1';

function normalizeBaseUrl(baseUrl?: string): string {
  return (baseUrl || DEFAULT_BASE_URL).replace(/\/$/, '');
}

function resolveSize(options: ImageGenerationOptions): string {
  return `${options.width || 1024}x${options.height || 1024}`;
}

export async function testAzureOpenAIImageConnectivity(
  config: ImageGenerationConfig,
): Promise<{ success: boolean; message: string }> {
  const baseUrl = normalizeBaseUrl(config.baseUrl);
  const model = config.model || DEFAULT_MODEL;

  try {
    const response = await fetch(`${baseUrl}/models/${encodeURIComponent(model)}`, {
      headers: { 'api-key': config.apiKey },
    });

    if (response.ok) {
      return { success: true, message: 'Connected to Azure OpenAI Image' };
    }

    const text = await response.text().catch(() => response.statusText);
    if (response.status === 401 || response.status === 403) {
      return {
        success: false,
        message: `Azure OpenAI Image auth failed (${response.status}): ${text}`,
      };
    }
    if (response.status === 404) {
      // 404 on model endpoint is expected on some Azure setups; treat as connected
      return { success: true, message: 'Connected to Azure OpenAI Image' };
    }
    return {
      success: false,
      message: `Azure OpenAI Image API error (${response.status}): ${text}`,
    };
  } catch (err) {
    return { success: false, message: `Azure OpenAI Image connectivity error: ${err}` };
  }
}

export async function generateWithAzureOpenAIImage(
  config: ImageGenerationConfig,
  options: ImageGenerationOptions,
): Promise<ImageGenerationResult> {
  const baseUrl = normalizeBaseUrl(config.baseUrl);
  const width = options.width || 1024;
  const height = options.height || 1024;

  const response = await fetch(`${baseUrl}/images/generations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-key': config.apiKey,
    },
    body: JSON.stringify({
      model: config.model || DEFAULT_MODEL,
      prompt: options.prompt,
      n: 1,
      size: resolveSize(options),
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => response.statusText);
    throw new Error(`Azure OpenAI image generation failed (${response.status}): ${text}`);
  }

  const data = await response.json();
  const imageData = data.data?.[0];
  if (!imageData?.url && !imageData?.b64_json) {
    throw new Error('Azure OpenAI Image returned empty image response');
  }

  return {
    url: imageData.url,
    base64: imageData.b64_json,
    width,
    height,
  };
}
