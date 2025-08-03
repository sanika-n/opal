export interface LinkThickness {
    [linkId: string]: number;
}

export interface BetterGraphSettings {
    // Visual settings
    defaultLinkThickness: number;
    linkThickness: LinkThickness;
    nodeSize: number;
    repulsionForce: number;
    linkDistance: number;
    minLinkThickness: number;
    maxLinkThickness: number;
    centerForce: number;
    
    // API settings
    openaiApiKey: string;
    pineconeApiKey: string;
    pineconeEnvironment: string;
    pineconeIndexName: string;
    
    // Embedding settings
    useEmbeddings: boolean;
    similarityThreshold: number;
}

export const DEFAULT_SETTINGS: BetterGraphSettings = {
    defaultLinkThickness: 2,
    linkThickness: {},
    nodeSize: 8,
    repulsionForce: 300,
    centerForce: 0.3,
    linkDistance: 100,
    minLinkThickness: 0.5,
    maxLinkThickness: 8,
    openaiApiKey: '',
    pineconeApiKey: '',
    pineconeEnvironment: '',
    pineconeIndexName: '',
    useEmbeddings: false,
    similarityThreshold: 0.3
}

export interface GraphNode {
    id: string;
    name: string;
    path: string;
    x: number;
    y: number;
    vx: number;
    vy: number;
    embedding?: number[];
    hidden?: boolean;
}

export interface GraphLink {
    source: string;
    target: string;
    id: string;
    similarity?: number;
    thickness?: number;
}