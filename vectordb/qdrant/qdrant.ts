import axios, { AxiosRequestConfig } from 'axios';

type Store = Map<string, number>;

export class Cache {
    store: Store

    constructor(public sizeX: number, public sizeY: number) {
        this.store = new Map<string, number>();
    }

    public get(key: any) {
        return this.store.get(key)
    }

    public set(key: any, value: any) {
        this.store.set(key, value);
    }
}

const VECTOR_SIZE = 1536; // ada002
const VECTOR_DISTANCE = 'Cosine';
const BATCH_SIZE = 500;

export interface Qdrant {
  Endpoint: string;
  cache: Cache;
}

export interface Point {
  ID: number;
  Vector: number[];
  Payload?: { [key: string]: string };
}

export interface Match {
  ID: number;
  Score: number;
  Payload: { [key: string]: string };
  Version: number;
}

export interface SearchResult {
  Result: Match[];
  Status: string;
  Time: number;
}

export interface NamespaceConfig {
  Vectors: {
    Size: number;
    Distance: string;
  };
}

export class Qdrant {
  private endpoint: string;
  private cache: Cache;

  constructor(endpoint: string) {
    this.endpoint = endpoint;
    this.cache = new Cache(5 * 60 * 1000, 10 * 60 * 1000);
  }

  private async namespaceExists(uuid: string): Promise<boolean> {
    try {
      const response = await axios.get(`${this.endpoint}/collections/${uuid}`);
      return response.status === 200;
    } catch (error) {
      if (error.response && error.response.status === 404) {
        return false;
      }
      throw error;
    }
  }

  private async createNamespace(uuid: string): Promise<void> {
    if (this.cache.getBy(uuid)) {
      return;
    }

    const exists = await this.namespaceExists(uuid);
    if (exists) {
      return;
    }

    const config: NamespaceConfig = {
      Vectors: {
        Size: VECTOR_SIZE,
        Distance: VECTOR_DISTANCE,
      },
    };

    const jsonData = JSON.stringify(config);

    const options: AxiosRequestConfig = {
      headers: {
        'Content-Type': 'application/json',
      },
    };

    await axios.put(`${this.endpoint}/collections/${uuid}`, jsonData, options);
    this.cache.set(uuid, true);
  }

  public async upsertEmbeddings(
    embeddings: number[][],
    chunks: Chunk[],
    uuid: string
  ): Promise<void> {
    await this.createNamespace(uuid);

    const points: Point[] = embeddings.map((embedding, i) => {
      const point: Point = {
        ID: i,
        Vector: embedding,
      };

      if (i < chunks.length) {
        point.Payload = {
          start: String(chunks[i].Start),
          end: String(chunks[i].End),
          title: chunks[i].Title,
          text: chunks[i].Text,
        };
      }

      return point;
    });

    for (let i = 0; i < points.length; i += BATCH_SIZE) {
      const end = Math.min(i + BATCH_SIZE, points.length);
      const data = { points: points.slice(i, end) };
      const jsonData = JSON.stringify(data);

      const options: AxiosRequestConfig = {
        headers: {
          'Content-Type': 'application/json',
        },
      };

      await axios.put(`${this.endpoint}/collections/${uuid}/points`, jsonData, options);
    }
  }

  public async retrieve(
    questionEmbedding: number[],
    topK: number,
    uuid: string
  ): Promise<vectordb.QueryMatch[]> {
    const data = {
      vector: questionEmbedding,
      top: topK,
      with_payload: true,
    };

    const jsonData = JSON.stringify(data);

    const options: AxiosRequestConfig = {
        headers: {
          'Content-Type': 'application/json',
        },
      };
  
      const response = await axios.post(`${this.endpoint}/collections/${uuid}/points/search`, jsonData, options);
  
      if (response.status !== 200) {
        throw new Error(`Failed to retrieve embeddings, status code: ${response.status}`);
      }
  
      const searchResult: SearchResult = response.data;
  
      const queryMatches: vectordb.QueryMatch[] = searchResult.Result.map((result) => ({
        ID: String(result.ID),
        Score: result.Score,
        Metadata: result.Payload,
      }));
  
      return queryMatches;
    }
  }
  
  
  
  
  