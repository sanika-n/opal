import { Notice } from 'obsidian';
import { BetterGraphSettings } from './types';

export class EmbeddingService {
    private openaiApiKey: string;
    private pineconeApiKey: string;
    private pineconeEnvironment: string;
    private pineconeIndexName: string;

    constructor(settings: BetterGraphSettings) {
        this.openaiApiKey = settings.openaiApiKey;
        this.pineconeApiKey = settings.pineconeApiKey;
        this.pineconeEnvironment = settings.pineconeEnvironment;
        this.pineconeIndexName = settings.pineconeIndexName;
    }

    updateSettings(settings: BetterGraphSettings) {
        this.openaiApiKey = settings.openaiApiKey;
        this.pineconeApiKey = settings.pineconeApiKey;
        this.pineconeEnvironment = settings.pineconeEnvironment;
        this.pineconeIndexName = settings.pineconeIndexName;
    }

    async getEmbedding(text: string): Promise<number[]> {
        if (!this.openaiApiKey) {
            throw new Error('OpenAI API key not configured');
        }

        try {
            const response = await fetch('https://api.openai.com/v1/embeddings', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.openaiApiKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    input: text,
                    model: 'text-embedding-ada-002'
                })
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(`OpenAI API error: ${response.status} ${response.statusText} - ${errorData.error?.message || 'Unknown error'}`);
            }

            const data = await response.json();
            return data.data[0].embedding;
        } catch (error) {
            console.error('Error getting embedding:', error);
            throw error;
        }
    }

    async storeEmbedding(id: string, embedding: number[], metadata: any = {}): Promise<void> {
        if (!this.pineconeApiKey || !this.pineconeEnvironment || !this.pineconeIndexName) {
            // Skip Pinecone storage if not configured
            return;
        }

        try {
            const response = await fetch(`https://${this.pineconeIndexName}-${this.pineconeEnvironment}.svc.pinecone.io/vectors/upsert`, {
                method: 'POST',
                headers: {
                    'Api-Key': this.pineconeApiKey,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    vectors: [{
                        id: id,
                        values: embedding,
                        metadata: metadata
                    }]
                })
            });

            if (!response.ok) {
                throw new Error(`Pinecone API error: ${response.statusText}`);
            }
        } catch (error) {
            console.error('Error storing embedding in Pinecone:', error);
            // Don't throw error here to allow local operation
        }
    }

    calculateCosineSimilarity(vec1: number[], vec2: number[]): number {
        if (vec1.length !== vec2.length) {
            throw new Error('Vectors must have the same length');
        }

        let dotProduct = 0;
        let magnitude1 = 0;
        let magnitude2 = 0;

        for (let i = 0; i < vec1.length; i++) {
            dotProduct += vec1[i] * vec2[i];
            magnitude1 += vec1[i] * vec1[i];
            magnitude2 += vec2[i] * vec2[i];
        }

        magnitude1 = Math.sqrt(magnitude1);
        magnitude2 = Math.sqrt(magnitude2);

        if (magnitude1 === 0 || magnitude2 === 0) {
            return 0;
        }

        return dotProduct / (magnitude1 * magnitude2);
    }

    cleanTextForEmbedding(content: string): string {
        // Remove markdown syntax and clean up text
        return content
            .replace(/#{1,6}\s+/g, '') // Remove headers
            .replace(/\*\*(.*?)\*\*/g, '$1') // Remove bold
            .replace(/\*(.*?)\*/g, '$1') // Remove italic
            .replace(/\[(.*?)\]\(.*?\)/g, '$1') // Remove links, keep text
            .replace(/```[\s\S]*?```/g, '') // Remove code blocks
            .replace(/`(.*?)`/g, '$1') // Remove inline code
            .replace(/---[\s\S]*?---/g, '') // Remove frontmatter
            .replace(/\n{3,}/g, '\n\n') // Normalize line breaks
            .trim();
    }
}