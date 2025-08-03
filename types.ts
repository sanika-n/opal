export interface LinkThickness {
    [linkId: string]: number;
}

export interface BetterGraphSettings {
    // API Keys
    openaiApiKey: string;
    pineconeApiKey: string;
    pineconeEnvironment: string;
    pineconeIndexName: string;
    
    // Embedding Settings
    useEmbeddings: boolean;
    similarityThreshold: number;
    
    // Graph Display
    nodeSize: number;
    linkDistance: number;
    repulsionForce: number;
    centerForce: number;
    
    // Link Appearance
    defaultLinkThickness: number;
    minLinkThickness: number;
    maxLinkThickness: number;
    linkThickness: Record<string, number>; // Custom thickness per link
}

export const DEFAULT_SETTINGS: BetterGraphSettings = {
    // API Keys
    openaiApiKey: '',
    pineconeApiKey: '',
    pineconeEnvironment: '',
    pineconeIndexName: '',
    
    // Embedding Settings
    useEmbeddings: false,
    similarityThreshold: 0.7,
    
    // Graph Display
    nodeSize: 10,
    linkDistance: 100,
    repulsionForce: 300,
    centerForce: 0.3,
    
    // Link Appearance
    defaultLinkThickness: 2,
    minLinkThickness: 0.5,
    maxLinkThickness: 8,
    linkThickness: {}
};

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
    type?: 'file' | 'tag';
}

export interface GraphLink {
    source: string;
    target: string;
    id: string;
    similarity?: number;
    thickness?: number;
    type?: 'link' | 'tag-link';
}