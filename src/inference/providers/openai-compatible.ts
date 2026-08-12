import type {
  ChatMessage,
  InferenceResponse,
  InferenceToolCall,
  TokenUsage,
} from "../../types.js";
import { ResilientHttpClient } from "../../conway/http-client.js";

export interface OpenAiCompatibleChatParams {
  model: string;
  body: Record<string, unknown>;
  apiUrl: string;
  apiKey: string;
  backend: string;
  httpClient: ResilientHttpClient;
  headers?: Record<string, string>;
  timeoutMs: number;
}

export function formatOpenAiCompatibleMessage(
  msg: ChatMessage,
): Record<string, unknown> {
  const formatted: Record<string, unknown> = {
    role: msg.role,
    content: msg.content,
  };

  if (msg.name) formatted.name = msg.name;
  if (msg.tool_calls) formatted.tool_calls = msg.tool_calls;
  if (msg.tool_call_id) formatted.tool_call_id = msg.tool_call_id;

  return formatted;
}

export async function chatViaOpenAiCompatible(
  params: OpenAiCompatibleChatParams,
): Promise<InferenceResponse> {
  let resp: Response;
  try {
    resp = await params.httpClient.request(`${params.apiUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${params.apiKey}`,
        ...params.headers,
      },
      body: JSON.stringify(params.body),
      timeout: params.timeoutMs,
    });
  } catch {
    throw new Error(`Inference request failed (${params.backend})`);
  }

  if (!resp.ok) {
    throw new Error(`Inference error (${params.backend}): ${resp.status}`);
  }

  try {
    return parseOpenAiCompatibleResponse(await resp.json(), params.model);
  } catch {
    throw new Error(`Invalid inference response (${params.backend})`);
  }
}

export function parseOpenAiCompatibleResponse(
  data: any,
  fallbackModel: string,
): InferenceResponse {
  const choice = data.choices?.[0];

  if (!choice) {
    throw new Error("No completion choice returned from inference");
  }

  const message = choice.message;
  const usage: TokenUsage = {
    promptTokens: data.usage?.prompt_tokens || 0,
    completionTokens: data.usage?.completion_tokens || 0,
    totalTokens: data.usage?.total_tokens || 0,
  };

  const toolCalls: InferenceToolCall[] | undefined =
    message.tool_calls?.map((tc: any) => ({
      id: tc.id,
      type: "function" as const,
      function: {
        name: tc.function.name,
        arguments: tc.function.arguments,
      },
    }));

  return {
    id: data.id || "",
    model: data.model || fallbackModel,
    message: {
      role: message.role,
      content: message.content || "",
      tool_calls: toolCalls,
    },
    toolCalls,
    usage,
    finishReason: choice.finish_reason || "stop",
  };
}
