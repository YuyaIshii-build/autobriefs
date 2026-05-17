export type BriefWebhookLocale = 'ja' | 'en';

export type ResolvedN8nBriefWebhook = {
  url: string;
  locale: BriefWebhookLocale;
};

const DEFAULT_EN_PROMPT_PIPELINE_ID = 'f3808527-76a2-45f5-822c-e6698c918211';

export function getEnPromptPipelineId(): string {
  return process.env.EN_PROMPT_PIPELINE_ID?.trim() || DEFAULT_EN_PROMPT_PIPELINE_ID;
}

/**
 * Selects n8n webhook URL from pipeline id (EN → N8N_BRIEF_WEBHOOK_URL_EN, else JP URL).
 * Does not fall back to JP webhook when EN URL is missing.
 */
export function resolveN8nBriefWebhookUrl(pipelineId: string): ResolvedN8nBriefWebhook {
  const normalizedId = pipelineId.trim();
  const enPipelineId = getEnPromptPipelineId();

  if (normalizedId === enPipelineId) {
    const url = process.env.N8N_BRIEF_WEBHOOK_URL_EN?.trim();
    if (!url) {
      throw new Error('N8N_BRIEF_WEBHOOK_URL_EN が未設定です');
    }
    return { url, locale: 'en' };
  }

  const url = process.env.N8N_BRIEF_WEBHOOK_URL?.trim();
  if (!url) {
    throw new Error('N8N_BRIEF_WEBHOOK_URL が未設定です');
  }
  return { url, locale: 'ja' };
}
