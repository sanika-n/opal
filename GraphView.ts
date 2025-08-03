import { ItemView, WorkspaceLeaf, TFile } from 'obsidian';
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

    async onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('better-graph-view-container');

        // Create main container
        this.container = contentEl.createDiv('graph-main-container');
        
        // Create header
        const header = this.container.createDiv('graph-header');
        const title = header.createDiv('graph-title');
        title.createEl('h2', { text: 'Graph View' });

        const settingsBtn = header.createDiv('graph-settings-btn');
        settingsBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M12 1v6m0 6v6m9-9h-6m-6 0H3m16.66-4.66l-4.24 4.24M7.58 7.58L3.34 3.34m16.66 16.66l-4.24-4.24M7.58 16.42l-4.24 4.24"></path></svg>`;

        // Create content wrapper
        const contentWrapper = this.container.createDiv('graph-content-wrapper');

        // Create graph container
        const graphContainer = contentWrapper.createDiv('graph-container');

        // Create controls panel (hidden by default)
        const controlsPanel = contentWrapper.createDiv('graph-controls-panel');
        controlsPanel.style.display = 'none';

        // Initialize controls
        this.controls = new GraphControls(controlsPanel, this.plugin, this);

        // Toggle settings panel
        settingsBtn.addEventListener('click', () => {
            const isVisible = controlsPanel.style.display === 'block';
            controlsPanel.style.display = isVisible ? 'none' : 'block';
            settingsBtn.classList.toggle('active', !isVisible);
        });

        // Initialize renderer with the graph container
        this.renderer = new GraphRenderer(graphContainer, this.plugin, this);

        // Load graph data
        await this.loadGraphData();

        // Start rendering
        this.renderer.initialize(this.nodes, this.links);

        // Handle window resize
        const resizeHandler = () => {
            this.renderer.resize();
        };
        window.addEventListener('resize', resizeHandler);
        this.register(() => window.removeEventListener('resize', resizeHandler));
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