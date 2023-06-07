import axios, { AxiosRequestConfig } from 'axios';

interface PineconeVector {
  ID: string;
  Values: number[];
  Metadata?: Record<string, string>;
}

interface Pinecone {
  Endpoint: string;
  ApiKey: string;
}

function New(apiKey: string, endpoint: string): Pinecone {
  return {
    Endpoint: endpoint,
    ApiKey: apiKey,
  };
}

async function UpsertEmbeddings(
  p: Pinecone,
  embeddings: number[][],
  chunks: any[],
  uuid: string
): Promise<void> {
  const url = `${p.Endpoint}/vectors/upsert`;

  const vectors: PineconeVector[] = embeddings.map((embedding, index) => {
    const chunk = chunks[index];
    return {
      ID: `id-${index}`,
      Values: embedding,
      Metadata: {
        file_name: chunk.Title,
        start: chunk.Start.toString(),
        end: chunk.End.toString(),
        title: chunk.Title,
        text: chunk.Text,
      },
    };
  });

  const maxVectorsPerRequest = 100;

  for (let i = 0; i < vectors.length; i += maxVectorsPerRequest) {
    const end = i + maxVectorsPerRequest;
    const requestBody = {
      Vectors: vectors.slice(i, end),
      Namespace: uuid,
    };

    const config: AxiosRequestConfig = {
      headers: {
        'Content-Type': 'application/json',
        'Api-Key': p.ApiKey,
      },
    };

    try {
      const response = await axios.post(url, requestBody, config);
      if (response.status !== 200) {
        throw new Error(response.data);
      }
    } catch (error) {
      throw error;
    }
  }
}

interface PineconeQueryRequest {
  TopK: number;
  IncludeMetadata: boolean;
  Namespace: string;
  Queries: PineconeQueryItem[];
}

interface PineconeQueryItem {
  Values: number[];
}

interface PineconeQueryResponseResult {
  Matches: any[];
}

interface PineconeQueryResponse {
  Results: PineconeQueryResponseResult[];
}

async function Retrieve(
  p: Pinecone,
  questionEmbedding: number[],
  topK: number,
  uuid: string
): Promise<any[]> {
  const requestBody: PineconeQueryRequest = {
    TopK: topK,
    IncludeMetadata: true,
    Namespace: uuid,
    Queries: [{ Values: questionEmbedding }],
  };

  const pineconeIndexURL = `${p.Endpoint}/query`;

  const config: AxiosRequestConfig = {
    headers: {
      'Content-Type': 'application/json',
      'Api-Key': p.ApiKey,
    },
  };

  try {
    const response = await axios.post(pineconeIndexURL, requestBody, config);
    const pineconeQueryResponse: PineconeQueryResponse = response.data;

    if (pineconeQueryResponse.Results.length > 0) {
      return pineconeQueryResponse.Results[0].Matches;
    } else {
      return [];
    }
  } catch (error) {
    throw error;
  }
}

function float32sToBytes(floats: number[]): Uint8Array {
  const result = new Uint8Array(4 * floats.length);
  for (let i = 0; i < floats.length; i++) {
    const view = new DataView(result.buffer);
    view.setFloat32(i * 4, floats[i]);
  }
  return result;
}

export { Pinecone, UpsertEmbeddings, Retrieve, float32sToBytes };
