import * as openai from 'path/to/openai'; // Replace with the correct path to the openai module
import * as chunk from 'path/to/chunk'; // Replace with the correct path to the chunk module
import * as tiktoken from 'path/to/tiktoken'; // Replace with the correct path to the tiktoken module
import { Context, ChatCompletionMessage, ChatCompletionRequest, CompletionRequest, EmbeddingRequest, EmbeddingModel, EmbeddingResponse } from 'path/to/openai'; // Replace with the correct path to the openai module or use appropriate type declarations

const formatPrompt = `Take this unstructured data (pasted at the end of the prompt), and format it into a JSON object with the following structure:

{summary: string, answers[{shortAnswer: string, explanation: string, questionSummaryTwoWordsMax: string}]}

I want the short answer to be Yes/No/Uncertain, and the explanation to be what is put after it.
If there is no short answer, infer whether it is Yes/No/Uncertain based on the explanation. The only acceptable contents of the shortAnswer string is "Yes", "No", or "Uncertain". Each answer object must have non-empty shortAnswer, explanation, and questionSummaryTwoWordsMax variables that are non-null. For the question summary, provide a one to two word string that summarizes the question the answer is responding to. The questionSummaryTwoWordsMax string must not exceed two words. The size of the answers array must be the same as the number of questions.

For some context, here were the input questions:
%s
Unstructured Data:
%s
`;

interface OpenAIResponse {
  Response: string;
  Tokens: number;
}

function callOpenAI(
  client: openai.Client,
  prompt: string,
  model: string,
  instructions: string,
  maxTokens: number
): Promise<[string, number]> {
  const temperature = 0.7;
  const topP = 1.0;
  const frequencyPenalty = 0.0;
  const presencePenalty = 0.6;
  const stop = ['Human:', 'AI:'];

  let assistantMessage: string;
  let tokens: number;

  if (model === openai.GPT3TextDavinci003) {
    prompt = `System Instructions:\n${instructions}\n\nPrompt:\n${prompt}`;
    return useCompletionAPI(client, prompt, model, temperature, maxTokens, topP, frequencyPenalty, presencePenalty, stop);
  } else {
    return useChatCompletionAPI(client, prompt, model, instructions, temperature, maxTokens, topP, frequencyPenalty, presencePenalty, stop);
  }

  async function useCompletionAPI(
    client: openai.Client,
    prompt: string,
    modelParam: string,
    temperature: number,
    maxTokens: number,
    topP: number,
    frequencyPenalty: number,
    presencePenalty: number,
    stop: string[]
  ): Promise<[string, number]> {
    const resp = await client.CreateCompletion(
      { model: modelParam, prompt, temperature, maxTokens, topP, frequencyPenalty, presencePenalty, stop }
    );

    return [resp.choices[0].text, resp.usage.totalTokens];
  }

  async function useChatCompletionAPI(
    client: openai.Client,
    prompt: string,
    modelParam: string,
    instructions: string,
    temperature: number,
    maxTokens: number,
    topP: number,
    frequencyPenalty: number,
    presencePenalty: number,
    stop: string[]
  ): Promise<[string, number]> {
    const messages: ChatCompletionMessage[] = [
      { role: 'system', content: instructions },
      { role: openai.ChatMessageRoleUser, content: prompt }
    ];

    const req: ChatCompletionRequest = {
      model: modelParam,
      messages,
      temperature,
      maxTokens,
      topP,
      frequencyPenalty,
      presencePenalty,
      stop
    };

    const resp = await client.CreateChatCompletion(req);

    return [resp.choices[0].message.content, resp.usage.totalTokens];
  }
}

function callEmbeddingAPIWithRetry(
  client: openai.Client,
  texts: string[],
  embedModel: EmbeddingModel,
  maxRetries: number
): Promise<EmbeddingResponse> {
  return new Promise((resolve, reject) => {
    let retries = 0;

    function callAPI() {
      client.CreateEmbeddings({ input: texts, model: embedModel })
        .then((res) => resolve(res))
        .catch((err) => {
          retries++;
          if (retries < maxRetries) {
            setTimeout(callAPI, 5000);
          } else {
            reject(err);
          }
        });
    }

    callAPI();
  });
}

async function getEmbeddings(
  client: openai.Client,
  chunks: chunk.Chunk[],
  batchSize: number,
  embedModel: EmbeddingModel
): Promise<number[][]> {
  const embeddings: number[][] = [];

  for (let i = 0; i < chunks.length; i += batchSize) {
    const iEnd = Math.min(chunks.length, i + batchSize);

    const texts = chunks.slice(i, iEnd).map((chunk) => chunk.Text);

    console.log('[getEmbeddings] Feeding texts to OpenAI to get embedding...\n', texts);

    const res = await callEmbeddingAPIWithRetry(client, texts, embedModel, 3);

    const embeds = res.data.map((record) => record.embedding);
    embeddings.push(...embeds);
  }

  return embeddings;
}

async function getEmbedding(
  client: openai.Client,
  text: string,
  embedModel: EmbeddingModel
): Promise<number[]> {
  const res = await callEmbeddingAPIWithRetry(client, [text], embedModel, 3);

  return res.data[0].embedding;
}

function min(a: number, b: number): number {
  return a < b ? a : b;
}

function buildPrompt(contexts: string[], question: string): string {
  const tokenLimit = 3750;
  const promptStart = 'Answer the question based on the context below.\n\nContext:\n';
  const promptEnd = `\n\nQuestion: ${question}\nAnswer:`;

  const tke = tiktoken.EncodingForModel('davinci');

  let currentTokenCount = tke.Encode(question, null, null).length;
  let prompt = '';

  for (let i = 0; i < contexts.length; i++) {
    const contextTokens = tke.Encode(contexts[i], null, null);
    currentTokenCount += contextTokens.length;

    if (currentTokenCount >= tokenLimit) {
      prompt = promptStart + contexts.slice(0, i).join('\n\n---\n\n') + promptEnd;
      break;
    } else if (i === contexts.length - 1) {
      prompt = promptStart + contexts.join('\n\n---\n\n') + promptEnd;
    }
  }

  return prompt;
}
