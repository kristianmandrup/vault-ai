import { Request, Response } from 'express';
import axios from 'axios';

interface Context {
  text: string;
  title: string;
}

interface Answer {
  answer: string;
  context: Context[];
  tokens: number;
}

interface OpenAIResponse {
  response: string;
  tokens: number;
}

class HandlerContext {
  openAIClient: string;
  vectorDB: string;

  constructor(openAIClient: string, vectorDB: string) {
    this.openAIClient = openAIClient;
    this.vectorDB = vectorDB;
  }

  async getEmbedding(text: string, embedModel: string): Promise<number[]> {
    const res = await axios.post('/openai/embeddings', {
      input: text,
      model: embedModel,
    });

    return res.data.data.embedding;
  }

  async retrieveMatches(questionEmbedding: number[], limit: number, uuid: string): Promise<Context[]> {
    const res = await axios.post('/vectorDB/retrieve', {
      questionEmbedding,
      limit,
      uuid,
    });

    return res.data.matches;
  }

  buildPrompt(contexts: string[], question: string): string {
    const tokenLimit = 3750;
    const promptStart = 'Answer the question based on the context below.\n\nContext:\n';
    const promptEnd = `\n\nQuestion: ${question}\nAnswer:`;

    let currentTokenCount = question.length;
    let prompt = '';

    for (const context of contexts) {
      currentTokenCount += context.length;

      if (currentTokenCount >= tokenLimit) {
        prompt = `${promptStart}${contexts.slice(0, -1).join('\n\n---\n\n')}${promptEnd}`;
        break;
      } else if (contexts.indexOf(context) === contexts.length - 1) {
        prompt = `${promptStart}${contexts.join('\n\n---\n\n')}${promptEnd}`;
      }
    }

    return prompt;
  }

  async callOpenAI(prompt: string, model: string, instructions: string, maxTokens: number): Promise<OpenAIResponse> {
    const response = await axios.post('/openai/completion', {
      prompt,
      model,
      instructions,
      maxTokens,
    });

    return {
      response: response.data.choices[0].text,
      tokens: response.data.usage.total_tokens,
    };
  }

  async questionHandler(req: Request, res: Response): Promise<void> {
    const { question, model, UUID, apiKey } = req.body;

    let clientToUse = this.openAIClient;
    if (apiKey !== '') {
      console.log('[QuestionHandler] Using provided custom API key:', apiKey);
      clientToUse = apiKey;
    }

    try {
      const questionEmbedding = await this.getEmbedding(question, 'AdaEmbeddingV2');
      console.log('[QuestionHandler] Question Embedding Length:', questionEmbedding.length);

      const matches = await this.retrieveMatches(questionEmbedding, 4, UUID);
      console.log('[QuestionHandler] Got matches from vector DB:', matches);

      const contexts = matches.map(match => ({
        text: match.metadata.text,
        title: match.metadata.title,
      }));
      console.log('[QuestionHandler] Retrieved context from vector DB:\n', contexts);

      const contextTexts = contexts.map(context => context.text);
      const prompt = this.buildPrompt(contextTexts, question);

      const modelToUse = model === 'GPT Davinci' ? 'GPT3TextDavinci003' : 'GPT3Dot5Turbo';

      console.log('[QuestionHandler] Sending OpenAI API request...\nPrompt:', prompt);
      const openAIResponse = await this.callOpenAI(
        prompt,
        modelToUse,
        'You are a helpful assistant answering questions based on the context provided.',
        512
      );
      console.log('[QuestionHandler] OpenAI response:\n', openAIResponse);

      const answer: Answer = {
        answer: openAIResponse.response,
        context: contexts,
        tokens: openAIResponse.tokens,
      };

      res.json(answer);
    } catch (err) {
      console.log('[QuestionHandler ERR]', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
}

// Usage
// const handlerContext = new HandlerContext('defaultOpenAIClient', 'defaultVectorDB');
// app.post('/question', handlerContext.questionHandler);
