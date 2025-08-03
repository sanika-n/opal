export interface BetterGraphSettings {
    defaultLinkThickness: number;
    nodeSize: number;
    linkDistance: number;
    centerForce: number;
    linkThickness: { [key: string]: number };
}

export const DEFAULT_SETTINGS: BetterGraphSettings = {
    defaultLinkThickness: 1,
    nodeSize: 5,
    linkDistance: 50,
    centerForce: 0.3,
    linkThickness: {}
}

export interface GraphNode {
    id: string;
    name: string;
    path: string;
    x?: number;
    y?: number;
    fx?: number | null;
    fy?: number | null;
}

export interface GraphLink {
    source: string | GraphNode;
    target: string | GraphNode;
    id: string;
}