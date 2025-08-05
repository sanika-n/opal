import { ItemView, WorkspaceLeaf, TFile, setIcon } from 'obsidian';
import { GraphRenderer } from './GraphRenderer';
import { GraphControls } from './GraphControls';
import { GraphNode, GraphLink } from './types';
import CombinedPlugin from './main';

export const VIEW_TYPE_GRAPH = "better-graph-view";

export class BetterGraphView extends ItemView {
    plugin: CombinedPlugin;
    renderer: GraphRenderer;
    controls: GraphControls;
    nodes: GraphNode[] = [];
    links: GraphLink[] = [];
    container: HTMLElement;

    filters = {
        showTags: false,
        showAttachments: false,
        existingFilesOnly: true,
        showOrphans: true,
        searchQuery: ''
    };

    constructor(leaf: WorkspaceLeaf, plugin: CombinedPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType() {
        return VIEW_TYPE_GRAPH;
    }

    getDisplayText() {
        return "Better Graph View";
    }

    getIcon() {
        return "dot-network";
    }

// In the onOpen() method, update the control panel creation:
// In the onOpen() method:

async onOpen() {
    const container = this.containerEl.children[1];
    container.empty();
    container.addClass('better-graph-view');
    
    // Create main container
    const mainContainer = container.createDiv('graph-main-container');
    
    // Create graph container
    const graphContainer = mainContainer.createDiv('graph-container');
    
    // Create floating control panel button
    const controlButton = mainContainer.createDiv('graph-control-button');
    setIcon(controlButton, 'settings');
    
    // Create control panel (hidden by default)
    const controlPanel = mainContainer.createDiv('graph-control-panel');
    controlPanel.style.display = 'none';
    
    // Add control panel header
    const controlHeader = controlPanel.createDiv('control-panel-header');
    controlHeader.createSpan({ text: 'Graph Controls', cls: 'control-panel-title' });
    const closeButton = controlHeader.createDiv('control-panel-close');
    setIcon(closeButton, 'x');
    
    // Create controls container
    const controlsContainer = controlPanel.createDiv('controls-container');
    this.controls = new GraphControls(controlsContainer, this.plugin, this);
    
    // Toggle control panel on button click
    controlButton.addEventListener('click', () => {
        if (controlPanel.style.display === 'none') {
            controlPanel.style.display = 'flex';
            controlButton.style.display = 'none';
        }
    });
    
    // Close control panel on X click
    closeButton.addEventListener('click', () => {
        controlPanel.style.display = 'none';
        controlButton.style.display = 'flex';
    });
    
    // Initialize renderer
    this.renderer = new GraphRenderer(graphContainer, this.plugin, this);
    
    // Load initial data
    await this.loadGraphData();
    
    // Initialize the graph
    this.renderer.initialize(this.nodes, this.links);
}
    
async loadGraphData() {
    const files = this.app.vault.getMarkdownFiles();
    const nodeMap = new Map<string, GraphNode>();
    const tagNodes = new Map<string, GraphNode>();
    const tagConnectionCount = new Map<string, number>();
    
    // Create nodes for files
    for (const file of files) {
        const embedding = await this.plugin.getEmbeddingLocally(file.path);
        nodeMap.set(file.path, {
            id: file.path,
            name: file.basename,
            path: file.path,
            x: 0,
            y: 0,
            vx: 0,
            vy: 0,
            embedding: embedding || undefined,
            type: 'file' as const
        });
    }
    
    // Create nodes for tags if enabled
    if (this.filters.showTags) {
        const allTags = new Set<string>();
        
        // Collect all tags and count connections
        for (const file of files) {
            const cache = this.app.metadataCache.getFileCache(file);
            
            if (cache?.tags) {
                cache.tags.forEach(tag => {
                    allTags.add(tag.tag);
                    tagConnectionCount.set(tag.tag, (tagConnectionCount.get(tag.tag) || 0) + 1);
                });
            }

            if (cache?.frontmatter) {
                const aiTags = cache.frontmatter['ai-tags'];
                if (Array.isArray(aiTags)) {
                    aiTags.forEach(tag => {
                        const tagWithHash = `#${tag}`;
                        allTags.add(tagWithHash);
                        tagConnectionCount.set(tagWithHash, (tagConnectionCount.get(tagWithHash) || 0) + 1);
                    });
                } else if (typeof aiTags === 'string') {
                    try {
                        const parsed = JSON.parse(aiTags);
                        if (Array.isArray(parsed)) {
                            parsed.forEach(tag => {
                                const tagWithHash = `#${tag}`;
                                allTags.add(tagWithHash);
                                tagConnectionCount.set(tagWithHash, (tagConnectionCount.get(tagWithHash) || 0) + 1);
                            });
                        }
                    } catch {
                        const tagMatches = aiTags.match(/["']([^"']+)["']/g);
                        if (tagMatches) {
                            tagMatches.forEach(match => {
                                const tag = match.replace(/["']/g, '');
                                const tagWithHash = `#${tag}`;
                                allTags.add(tagWithHash);
                                tagConnectionCount.set(tagWithHash, (tagConnectionCount.get(tagWithHash) || 0) + 1);
                            });
                        }
                    }
                }
            }
        }
        
        // Create tag nodes with connection count
        allTags.forEach(tag => {
            tagNodes.set(tag, {
                id: tag,
                name: tag,
                path: tag,
                x: 0,
                y: 0,
                vx: 0,
                vy: 0,
                type: 'tag' as const,
                connectionCount: tagConnectionCount.get(tag) || 1
            });
        });
    }
    
    // Combine all nodes
    this.nodes = [...Array.from(nodeMap.values()), ...Array.from(tagNodes.values())];
    console.log('Total nodes:', this.nodes.length, 'Tag nodes:', tagNodes.size);
    // Create links
    this.links = [];
    
    // Create file-to-file links
    if (this.plugin.settings.useEmbeddings && this.nodes.some(n => n.embedding)) {
        await this.createEmbeddingBasedLinks(nodeMap);
    } else {
        this.createTraditionalLinks(files, nodeMap);
    }
    
    // Create tag links
    if (this.filters.showTags) {
        this.createTagLinks(files, nodeMap, tagNodes);
        console.log('Tag links created:', this.links.filter(l => l.type === 'tag-link').length);
    }

    if (this.renderer && this.renderer.isInitialized) {
        this.renderer.updateData(this.nodes, this.links);
    }
}

createTagLinks(files: TFile[], nodeMap: Map<string, GraphNode>, tagNodes: Map<string, GraphNode>) {
    files.forEach(file => {
        const cache = this.app.metadataCache.getFileCache(file);
        const fileNode = nodeMap.get(file.path);
        
        if (!fileNode || !cache) return;
        
        // Link to regular tags
        if (cache.tags) {
            cache.tags.forEach(tag => {
                const tagNode = tagNodes.get(tag.tag);
                if (tagNode) {
                    this.links.push({
                        source: fileNode.id,
                        target: tagNode.id,
                        id: `${fileNode.id}-tag-${tagNode.id}`,
                        type: 'tag-link' as const
                    });
                }
            });
        }
        
        // Link to AI-generated tags
        if (cache.frontmatter?.['ai-tags']) {
            const aiTags = cache.frontmatter['ai-tags'];
            
            let tagList: string[] = [];
            
            if (Array.isArray(aiTags)) {
                tagList = aiTags;
            } else if (typeof aiTags === 'string') {
                // Handle string format like "[\"tag1\", \"tag2\"]"
                try {
                    const parsed = JSON.parse(aiTags);
                    if (Array.isArray(parsed)) {
                        tagList = parsed;
                    }
                } catch {
                    // Try regex parsing for non-JSON strings
                    const matches = aiTags.match(/["']([^"']+)["']/g);
                    if (matches) {
                        tagList = matches.map(m => m.replace(/["']/g, ''));
                    }
                }
            }
            
            tagList.forEach(tag => {
                const tagWithHash = tag.startsWith('#') ? tag : `#${tag}`;
                const tagNode = tagNodes.get(tagWithHash);
                if (tagNode) {
                    this.links.push({
                        source: fileNode.id,
                        target: tagNode.id,
                        id: `${fileNode.id}-ai-tag-${tagNode.id}`,
                        type: 'tag-link' as const
                    });
                }
            });
        }
    });
}

    async createEmbeddingBasedLinks(nodeMap: Map<string, GraphNode>) {
        const nodesArray = Array.from(nodeMap.values());
        
        for (let i = 0; i < nodesArray.length; i++) {
            for (let j = i + 1; j < nodesArray.length; j++) {
                const nodeA = nodesArray[i];
                const nodeB = nodesArray[j];
                
                if (nodeA.embedding && nodeB.embedding) {
                    const similarity = this.plugin.embeddingService.calculateCosineSimilarity(
                        nodeA.embedding, 
                        nodeB.embedding
                    );
                    
                    if (similarity >= this.plugin.settings.similarityThreshold) {
                        const linkId = `${nodeA.id}<->${nodeB.id}`;
                        
                        this.links.push({
                            source: nodeA.id,
                            target: nodeB.id,
                            id: linkId,
                            similarity: similarity,
                            thickness: this.calculateThicknessFromSimilarity(similarity)
                        });
                    }
                }
            }
        }
    }

    createTraditionalLinks(files: TFile[], nodeMap: Map<string, GraphNode>) {
        files.forEach(file => {
            const cache = this.app.metadataCache.getFileCache(file);
            if (cache?.links) {
                cache.links.forEach(link => {
                    const targetFile = this.app.metadataCache.getFirstLinkpathDest(link.link, file.path);
                    if (targetFile && nodeMap.has(targetFile.path)) {
                        const linkId = `${file.path}->${targetFile.path}`;
                        this.links.push({
                            source: file.path,
                            target: targetFile.path,
                            id: linkId,
                            thickness: this.plugin.settings.defaultLinkThickness
                        });
                    }
                });
            }
        });
    }

    calculateThicknessFromSimilarity(similarity: number): number {
        const normalizedSimilarity = (similarity - this.plugin.settings.similarityThreshold) / 
            (1.0 - this.plugin.settings.similarityThreshold);
        
        return this.plugin.settings.minLinkThickness + 
            (normalizedSimilarity * (this.plugin.settings.maxLinkThickness - this.plugin.settings.minLinkThickness));
    }

    async refresh() {
        if (!this.renderer || !this.renderer.isInitialized) {
            console.warn('Cannot refresh: renderer not initialized');
            return;
        }
        
        await this.loadGraphData();
        // No need to call updateData here since loadGraphData already does it
    }

    async onClose() {
        if (this.renderer) {
            this.renderer.destroy();
        }
    }
}