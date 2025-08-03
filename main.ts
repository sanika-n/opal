import { Plugin, Notice, App, Modal, PluginSettingTab, Setting, TFile } from 'obsidian';
import { BetterGraphSettings, DEFAULT_SETTINGS, GraphNode, GraphLink } from './types';
import { EmbeddingService } from './EmbeddingService';

export default class BetterGraphPlugin extends Plugin {
    settings: BetterGraphSettings;
    embeddingService: EmbeddingService;

    async onload() {
        await this.loadSettings();
        this.embeddingService = new EmbeddingService(this.settings);

        // Add ribbon icon
        const ribbonIconEl = this.addRibbonIcon('dot-network', 'Better Graph View', (evt: MouseEvent) => {
            new BetterGraphModal(this.app, this).open();
        });
        ribbonIconEl.addClass('better-graph-ribbon');

        // Add command to open graph
        this.addCommand({
            id: 'open-better-graph-view',
            name: 'Open Better Graph View',
            callback: () => {
                new BetterGraphModal(this.app, this).open();
            }
        });

        // Add command to generate embeddings
        this.addCommand({
            id: 'generate-embeddings',
            name: 'Generate Embeddings for All Notes',
            callback: async () => {
                await this.generateEmbeddingsForAllNotes();
            }
        });

        // Add settings tab
        this.addSettingTab(new BetterGraphSettingTab(this.app, this));
    }

    async generateEmbeddingsForAllNotes(): Promise<void> {
        if (!this.settings.openaiApiKey) {
            new Notice('Please configure OpenAI API key in settings first');
            return;
        }

        const files = this.app.vault.getMarkdownFiles();
        const notice = new Notice('Generating embeddings...', 0);
        
        try {
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                notice.setMessage(`Generating embeddings... ${i + 1}/${files.length}`);
                
                const content = await this.app.vault.read(file);
                const cleanContent = this.embeddingService.cleanTextForEmbedding(content);
                
                if (cleanContent.trim()) {
                    const embedding = await this.embeddingService.getEmbedding(cleanContent);
                    await this.embeddingService.storeEmbedding(file.path, embedding, {
                        title: file.basename,
                        path: file.path
                    });
                    
                    // Store embedding locally for quick access
                    await this.storeEmbeddingLocally(file.path, embedding);
                }

                // Rate limiting - wait a bit between requests
                await new Promise(resolve => setTimeout(resolve, 200));
            }
            
            notice.hide();
            new Notice(`Generated embeddings for ${files.length} notes`);
        } catch (error) {
            notice.hide();
            new Notice(`Error generating embeddings: ${error.message}`);
            console.error('Embedding generation error:', error);
        }
    }

    async storeEmbeddingLocally(filePath: string, embedding: number[]): Promise<void> {
        const data = await this.loadData() || {};
        if (!data.embeddings) {
            data.embeddings = {};
        }
        data.embeddings[filePath] = embedding;
        data.settings = this.settings; // Keep settings separate
        await this.saveData(data);
    }

    async getEmbeddingLocally(filePath: string): Promise<number[] | null> {
        const data = await this.loadData() || {};
        return data.embeddings?.[filePath] || null;
    }

    async loadSettings() {
        const data = await this.loadData();
        this.settings = Object.assign({}, DEFAULT_SETTINGS, data?.settings || data || {});
    }

    async saveSettings() {
        const data = await this.loadData() || {};
        data.settings = this.settings;
        await this.saveData(data);
        
        // Update embedding service with new settings
        if (this.embeddingService) {
            this.embeddingService.updateSettings(this.settings);
        }
    }
}

class BetterGraphModal extends Modal {
    plugin: BetterGraphPlugin;
    canvas: HTMLCanvasElement;
    ctx: CanvasRenderingContext2D;
    nodes: GraphNode[] = [];
    links: GraphLink[] = [];
    selectedLink: GraphLink | null = null;
    isDragging = false;
    dragNode: GraphNode | null = null;
    animationId: number;
    controlsEl: HTMLElement;

    constructor(app: App, plugin: BetterGraphPlugin) {
        super(app);
        this.plugin = plugin;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.addClass('better-graph-modal');
        
        // Create main container
        const container = contentEl.createDiv('graph-container');
        
        // Create controls panel
        this.controlsEl = container.createDiv('graph-controls');
        this.createControls();
        
        // Create canvas
        this.canvas = container.createEl('canvas', {
            attr: { width: '800', height: '600' }
        });
        this.ctx = this.canvas.getContext('2d')!;
        
        // Set up canvas styling
        this.canvas.style.border = '1px solid var(--background-modifier-border)';
        this.canvas.style.backgroundColor = 'var(--background-primary)';
        
        // Load graph data and start simulation
        this.loadGraphData();
        this.setupEventListeners();
        this.startSimulation();
        
        // Add custom CSS
        this.addCustomCSS();
    }

    createControls() {
        this.controlsEl.createEl('h3', { text: 'Graph Controls' });
        
        // Embedding controls
        const embeddingSection = this.controlsEl.createDiv('control-section');
        embeddingSection.createEl('h4', { text: 'Semantic Similarity' });
        
        // Use embeddings toggle
        const embeddingToggle = embeddingSection.createDiv('control-item');
        embeddingToggle.createEl('label', { text: 'Use Semantic Similarity:' });
        const useEmbeddingsCheckbox = embeddingToggle.createEl('input', { type: 'checkbox' });
        useEmbeddingsCheckbox.checked = this.plugin.settings.useEmbeddings;
        useEmbeddingsCheckbox.addEventListener('change', (e) => {
            this.plugin.settings.useEmbeddings = (e.target as HTMLInputElement).checked;
            this.plugin.saveSettings();
            this.loadGraphData();
        });

        // Similarity threshold
        const thresholdContainer = embeddingSection.createDiv('control-item');
        thresholdContainer.createEl('label', { text: 'Similarity Threshold:' });
        const thresholdSlider = thresholdContainer.createEl('input', {
            type: 'range',
            attr: { min: '0.1', max: '0.9', step: '0.05' }
        });
        thresholdSlider.value = this.plugin.settings.similarityThreshold.toString();
        const thresholdValue = thresholdContainer.createEl('span', { 
            text: this.plugin.settings.similarityThreshold.toFixed(2) 
        });
        
        thresholdSlider.addEventListener('input', (e) => {
            const value = parseFloat((e.target as HTMLInputElement).value);
            this.plugin.settings.similarityThreshold = value;
            thresholdValue.setText(value.toFixed(2));
            this.plugin.saveSettings();
            if (this.plugin.settings.useEmbeddings) {
                this.loadGraphData();
            }
        });

        // Generate embeddings button
        const generateBtn = embeddingSection.createEl('button', { text: 'Generate Embeddings' });
        generateBtn.addEventListener('click', async () => {
            generateBtn.disabled = true;
            generateBtn.setText('Generating...');
            await this.plugin.generateEmbeddingsForAllNotes();
            generateBtn.disabled = false;
            generateBtn.setText('Generate Embeddings');
            this.loadGraphData();
        });
        
        // Link thickness controls
        const thicknessSection = this.controlsEl.createDiv('control-section');
        thicknessSection.createEl('h4', { text: 'Link Thickness' });
        
        // Min/Max thickness controls
        const minThicknessContainer = thicknessSection.createDiv('control-item');
        minThicknessContainer.createEl('label', { text: 'Min Thickness:' });
        const minThicknessSlider = minThicknessContainer.createEl('input', {
            type: 'range',
            attr: { min: '0.1', max: '5', step: '0.1' }
        });
        minThicknessSlider.value = this.plugin.settings.minLinkThickness.toString();
        const minThicknessValue = minThicknessContainer.createEl('span', { 
            text: this.plugin.settings.minLinkThickness.toString() 
        });
        
        minThicknessSlider.addEventListener('input', (e) => {
            const value = parseFloat((e.target as HTMLInputElement).value);
            this.plugin.settings.minLinkThickness = value;
            minThicknessValue.setText(value.toString());
            this.plugin.saveSettings();
        });

        const maxThicknessContainer = thicknessSection.createDiv('control-item');
        maxThicknessContainer.createEl('label', { text: 'Max Thickness:' });
        const maxThicknessSlider = maxThicknessContainer.createEl('input', {
            type: 'range',
            attr: { min: '2', max: '15', step: '0.5' }
        });
        maxThicknessSlider.value = this.plugin.settings.maxLinkThickness.toString();
        const maxThicknessValue = maxThicknessContainer.createEl('span', { 
            text: this.plugin.settings.maxLinkThickness.toString() 
        });
        
        maxThicknessSlider.addEventListener('input', (e) => {
            const value = parseFloat((e.target as HTMLInputElement).value);
            this.plugin.settings.maxLinkThickness = value;
            maxThicknessValue.setText(value.toString());
            this.plugin.saveSettings();
        });

        // Default link thickness
        const defaultThicknessContainer = thicknessSection.createDiv('control-item');
        defaultThicknessContainer.createEl('label', { text: 'Default Thickness:' });
        const defaultThicknessSlider = defaultThicknessContainer.createEl('input', {
            type: 'range',
            attr: { min: '1', max: '10', step: '0.5' }
        });
        defaultThicknessSlider.value = this.plugin.settings.defaultLinkThickness.toString();
        const defaultThicknessValue = defaultThicknessContainer.createEl('span', { 
            text: this.plugin.settings.defaultLinkThickness.toString() 
        });
        
        defaultThicknessSlider.addEventListener('input', (e) => {
            const value = parseFloat((e.target as HTMLInputElement).value);
            this.plugin.settings.defaultLinkThickness = value;
            defaultThicknessValue.setText(value.toString());
            this.plugin.saveSettings();
        });

        // Physics settings
        const physicsSection = this.controlsEl.createDiv('control-section');
        physicsSection.createEl('h4', { text: 'Physics' });
        
        // Node size
        const nodeSizeContainer = physicsSection.createDiv('control-item');
        nodeSizeContainer.createEl('label', { text: 'Node Size:' });
        const nodeSizeSlider = nodeSizeContainer.createEl('input', {
            type: 'range',
            attr: { min: '3', max: '20', step: '1' }
        });
        nodeSizeSlider.value = this.plugin.settings.nodeSize.toString();
        const nodeSizeValue = nodeSizeContainer.createEl('span', { 
            text: this.plugin.settings.nodeSize.toString() 
        });
        
        nodeSizeSlider.addEventListener('input', (e) => {
            const value = parseInt((e.target as HTMLInputElement).value);
            this.plugin.settings.nodeSize = value;
            nodeSizeValue.setText(value.toString());
            this.plugin.saveSettings();
        });

        // Repulsion force
        const repulsionContainer = physicsSection.createDiv('control-item');
        repulsionContainer.createEl('label', { text: 'Repulsion Force:' });
        const repulsionSlider = repulsionContainer.createEl('input', {
            type: 'range',
            attr: { min: '100', max: '1000', step: '50' }
        });
        repulsionSlider.value = this.plugin.settings.repulsionForce.toString();
        const repulsionValue = repulsionContainer.createEl('span', { 
            text: this.plugin.settings.repulsionForce.toString() 
        });
        
        repulsionSlider.addEventListener('input', (e) => {
            const value = parseInt((e.target as HTMLInputElement).value);
            this.plugin.settings.repulsionForce = value;
            repulsionValue.setText(value.toString());
            this.plugin.saveSettings();
        });

        // Link distance
        const linkDistanceContainer = physicsSection.createDiv('control-item');
        linkDistanceContainer.createEl('label', { text: 'Link Distance:' });
        const linkDistanceSlider = linkDistanceContainer.createEl('input', {
            type: 'range',
            attr: { min: '50', max: '200', step: '10' }
        });
        linkDistanceSlider.value = this.plugin.settings.linkDistance.toString();
        const linkDistanceValue = linkDistanceContainer.createEl('span', { 
            text: this.plugin.settings.linkDistance.toString() 
        });
        
        linkDistanceSlider.addEventListener('input', (e) => {
            const value = parseInt((e.target as HTMLInputElement).value);
            this.plugin.settings.linkDistance = value;
            linkDistanceValue.setText(value.toString());
            this.plugin.saveSettings();
        });
        
        // Individual link controls
        const linkSection = this.controlsEl.createDiv('control-section');
        linkSection.createEl('h4', { text: 'Selected Link' });
        const linkInfo = linkSection.createEl('p', { 
            text: 'Click on a link to customize it' 
        });
        linkInfo.addClass('link-info');
    }

    async loadGraphData() {
        const files = this.app.vault.getMarkdownFiles();
        const nodeMap = new Map<string, GraphNode>();
        
        // Create nodes for each file
        for (const file of files) {
            const embedding = await this.plugin.getEmbeddingLocally(file.path);
            nodeMap.set(file.path, {
                id: file.path,
                name: file.basename,
                x: Math.random() * 700 + 50,
                y: Math.random() * 500 + 50,
                vx: 0,
                vy: 0,
                embedding: embedding || undefined
            });
        }
        
        this.nodes = Array.from(nodeMap.values());
        
        // Create links based on embeddings or traditional connections
        this.links = [];
        
        if (this.plugin.settings.useEmbeddings) {
            await this.createEmbeddingBasedLinks(nodeMap);
        } else {
            this.createTraditionalLinks(files, nodeMap);
        }
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
                        const thickness = this.calculateThicknessFromSimilarity(similarity);
                        const linkId = `${nodeA.id}<->${nodeB.id}`;
                        
                        this.links.push({
                            source: nodeA.id,
                            target: nodeB.id,
                            id: linkId,
                            similarity: similarity,
                            thickness: thickness
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
                            id: linkId
                        });
                    }
                });
            }
        });
    }

    calculateThicknessFromSimilarity(similarity: number): number {
        // Normalize similarity (threshold to 1.0) to thickness range
        const normalizedSimilarity = (similarity - this.plugin.settings.similarityThreshold) / 
            (1.0 - this.plugin.settings.similarityThreshold);
        
        return this.plugin.settings.minLinkThickness + 
            (normalizedSimilarity * (this.plugin.settings.maxLinkThickness - this.plugin.settings.minLinkThickness));
    }

    setupEventListeners() {
        this.canvas.addEventListener('mousedown', this.onMouseDown.bind(this));
        this.canvas.addEventListener('mousemove', this.onMouseMove.bind(this));
        this.canvas.addEventListener('mouseup', this.onMouseUp.bind(this));
        this.canvas.addEventListener('click', this.onClick.bind(this));
    }

    onMouseDown(e: MouseEvent) {
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        for (const node of this.nodes) {
            const dx = x - node.x;
            const dy = y - node.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance < this.plugin.settings.nodeSize + 5) {
                this.isDragging = true;
                this.dragNode = node;
                break;
            }
        }
    }

    onMouseMove(e: MouseEvent) {
        if (this.isDragging && this.dragNode) {
            const rect = this.canvas.getBoundingClientRect();
            this.dragNode.x = e.clientX - rect.left;
            this.dragNode.y = e.clientY - rect.top;
        }
    }

    onMouseUp(e: MouseEvent) {
        this.isDragging = false;
        this.dragNode = null;
    }

    onClick(e: MouseEvent) {
        if (this.isDragging) return;
        
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        for (const link of this.links) {
            const sourceNode = this.nodes.find(n => n.id === link.source);
            const targetNode = this.nodes.find(n => n.id === link.target);
            
            if (sourceNode && targetNode) {
                const distance = this.distanceToLine(x, y, sourceNode.x, sourceNode.y, targetNode.x, targetNode.y);
                if (distance < 10) {
                    this.selectLink(link);
                    break;
                }
            }
        }
    }

    distanceToLine(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
        const A = px - x1;
        const B = py - y1;
        const C = x2 - x1;
        const D = y2 - y1;
        
        const dot = A * C + B * D;
        const lenSq = C * C + D * D;
        let param = -1;
        
        if (lenSq !== 0) {
            param = dot / lenSq;
        }
        
        let xx, yy;
        
        if (param < 0) {
            xx = x1;
            yy = y1;
        } else if (param > 1) {
            xx = x2;
            yy = y2;
        } else {
            xx = x1 + param * C;
            yy = y1 + param * D;
        }
        
        const dx = px - xx;
        const dy = py - yy;
        return Math.sqrt(dx * dx + dy * dy);
    }

    selectLink(link: GraphLink) {
        this.selectedLink = link;
        this.updateLinkControls();
    }

    updateLinkControls() {
        const existingControls = this.controlsEl.querySelector('.selected-link-controls');
        if (existingControls) {
            existingControls.remove();
        }
        
        if (!this.selectedLink) return;
        
        const linkSection = this.controlsEl.querySelector('.control-section:last-child') as HTMLElement;
        const linkControlsSection = linkSection.createDiv('selected-link-controls');
        
        const sourceNode = this.nodes.find(n => n.id === this.selectedLink!.source);
        const targetNode = this.nodes.find(n => n.id === this.selectedLink!.target);
        
        linkControlsSection.createEl('p', { 
            text: `${sourceNode?.name} ↔ ${targetNode?.name}` 
        });

        if (this.selectedLink.similarity !== undefined) {
            linkControlsSection.createEl('p', { 
                text: `Similarity: ${this.selectedLink.similarity.toFixed(3)}` 
            });
        }
        
        const currentThickness = this.plugin.settings.linkThickness[this.selectedLink.id] || 
            this.selectedLink.thickness || this.plugin.settings.defaultLinkThickness;
        
        const thicknessContainer = linkControlsSection.createDiv('control-item');
        thicknessContainer.createEl('label', { text: 'Custom Thickness:' });
        const thicknessSlider = thicknessContainer.createEl('input', {
            type: 'range',
            attr: { min: '0.5', max: '15', step: '0.5' }
        });
        thicknessSlider.value = currentThickness.toString();
        const thicknessValue = thicknessContainer.createEl('span', { 
            text: currentThickness.toFixed(1) 
        });
        
        thicknessSlider.addEventListener('input', (e) => {
            const value = parseFloat((e.target as HTMLInputElement).value);
            this.plugin.settings.linkThickness[this.selectedLink!.id] = value;
            thicknessValue.setText(value.toFixed(1));
            this.plugin.saveSettings();
        });
        
        const resetBtn = linkControlsSection.createEl('button', { text: 'Reset to Auto' });
        resetBtn.addEventListener('click', () => {
            delete this.plugin.settings.linkThickness[this.selectedLink!.id];
            const defaultThickness = this.selectedLink!.thickness || this.plugin.settings.defaultLinkThickness;
            thicknessSlider.value = defaultThickness.toString();
            thicknessValue.setText(defaultThickness.toFixed(1));
            this.plugin.saveSettings();
        });
    }

    startSimulation() {
        const animate = () => {
            this.updatePhysics();
            this.draw();
            this.animationId = requestAnimationFrame(animate);
        };
        animate();
    }

    updatePhysics() {
        const alpha = 0.1;
        
        // Apply forces between nodes (repulsion)
        for (let i = 0; i < this.nodes.length; i++) {
            for (let j = i + 1; j < this.nodes.length; j++) {
                const nodeA = this.nodes[i];
                const nodeB = this.nodes[j];
                
                const dx = nodeB.x - nodeA.x;
                const dy = nodeB.y - nodeA.y;
                const distance = Math.sqrt(dx * dx + dy * dy) || 1;
                
                const force = this.plugin.settings.repulsionForce / (distance * distance);
                const fx = (dx / distance) * force;
                const fy = (dy / distance) * force;
                
                nodeA.vx -= fx;
                nodeA.vy -= fy;
                nodeB.vx += fx;
                nodeB.vy += fy;
            }
        }
        
        // Apply spring forces for links
        for (const link of this.links) {
            const sourceNode = this.nodes.find(n => n.id === link.source);
            const targetNode = this.nodes.find(n => n.id === link.target);
            
            if (sourceNode && targetNode) {
                const dx = targetNode.x - sourceNode.x;
                const dy = targetNode.y - sourceNode.y;
                const distance = Math.sqrt(dx * dx + dy * dy) || 1;
                
                const targetDistance = this.plugin.settings.linkDistance;
                const force = (distance - targetDistance) * 0.1;
                const fx = (dx / distance) * force;
                const fy = (dy / distance) * force;
                
                sourceNode.vx += fx;
                sourceNode.vy += fy;
                targetNode.vx -= fx;
                targetNode.vy -= fy;
            }
        }
        
        // Update positions and apply damping
        for (const node of this.nodes) {
            if (!this.isDragging || this.dragNode !== node) {
                node.vx *= 0.9;
                node.vy *= 0.9;
                node.x += node.vx * alpha;
                node.y += node.vy * alpha;
                
                node.x = Math.max(20, Math.min(this.canvas.width - 20, node.x));
                node.y = Math.max(20, Math.min(this.canvas.height - 20, node.y));
            }
        }
    }

    draw() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Draw links
        for (const link of this.links) {
            const sourceNode = this.nodes.find(n => n.id === link.source);
            const targetNode = this.nodes.find(n => n.id === link.target);
            
            if (sourceNode && targetNode) {
                let thickness = this.plugin.settings.linkThickness[link.id] || 
                    link.thickness || this.plugin.settings.defaultLinkThickness;
                
                const isSelected = this.selectedLink?.id === link.id;
                
                this.ctx.beginPath();
                this.ctx.moveTo(sourceNode.x, sourceNode.y);
                this.ctx.lineTo(targetNode.x, targetNode.y);
                this.ctx.lineWidth = thickness;
                
                // Color based on similarity if available
                let strokeColor = 'var(--text-muted)';
                if (link.similarity !== undefined) {
                    const intensity = Math.floor(255 * ((link.similarity - this.plugin.settings.similarityThreshold) / (1 - this.plugin.settings.similarityThreshold)));
                    const blue = 255 - intensity;
                    const red = intensity;
                    strokeColor = `rgb(${red}, 100, ${blue})`;
                }
                
                this.ctx.strokeStyle = isSelected ? '#ff6b6b' : strokeColor;
                this.ctx.stroke();
            }
        }
        
        // Draw nodes
        for (const node of this.nodes) {
            this.ctx.beginPath();
            this.ctx.arc(node.x, node.y, this.plugin.settings.nodeSize, 0, 2 * Math.PI);
            
            this.ctx.fillStyle = node.embedding ? 'var(--interactive-accent)' : 'var(--text-muted)';
            this.ctx.fill();
            this.ctx.strokeStyle = 'var(--background-primary)';
            this.ctx.lineWidth = 2;
            this.ctx.stroke();
            
            // Draw node labels
            this.ctx.fillStyle = 'var(--text-normal)';
            this.ctx.font = '12px var(--font-interface)';
            this.ctx.textAlign = 'center';
            this.ctx.fillText(node.name, node.x, node.y + this.plugin.settings.nodeSize + 15);
        }
    }

    addCustomCSS() {
        const style = document.createElement('style');
        style.textContent = `
            .better-graph-modal .modal {
                width: 90vw;
                height: 90vh;
                max-width: 1400px;
                max-height: 900px;
            }
            
            .graph-container {
                display: flex;
                height: 100%;
                gap: 20px;
            }
            
            .graph-controls {
                width: 320px;
                padding: 15px;
                background: var(--background-secondary);
                border-radius: 8px;
                overflow-y: auto;
                flex-shrink: 0;
            }
            
            .control-section {
                margin-bottom: 25px;
                padding-bottom: 15px;
                border-bottom: 1px solid var(--background-modifier-border);
            }
            
            .control-section:last-child {
                border-bottom: none;
            }
            
            .control-section h4 {
                margin: 0 0 15px 0;
                color: var(--text-accent);
                font-size: 14px;
                font-weight: 600;
            }
            
            .control-item {
                margin-bottom: 12px;
            }
            
            .control-item label {
                display: block;
                margin-bottom: 6px;
                font-size: 12px;
                color: var(--text-muted);
                font-weight: 500;
            }
            
            .control-item input[type="range"] {
                width: 100%;
                margin-bottom: 4px;
            }
            
            .control-item input[type="checkbox"] {
                margin-right: 8px;
            }
            
            .control-item span {
                font-weight: bold;
                color: var(--text-accent);
                font-size: 12px;
            }
            
            .control-section button {
                width: 100%;
                padding: 10px;
                background: var(--interactive-accent);
                color: var(--text-on-accent);
                border: none;
                border-radius: 6px;
                cursor: pointer;
                margin-top: 8px;
                font-size: 13px;
                font-weight: 500;
                transition: background-color 0.2s;
            }
            
            .control-section button:hover {
                background: var(--interactive-accent-hover);
            }
            
            .control-section button:disabled {
                background: var(--text-faint);
                cursor: not-allowed;
                opacity: 0.6;
            }
            
            .link-info {
                font-size: 11px;
                color: var(--text-muted);
                font-style: italic;
                margin: 0;
            }
            
            .selected-link-controls {
                margin-top: 15px;
                padding-top: 15px;
                border-top: 1px solid var(--background-modifier-border);
            }
            
            .selected-link-controls p {
                margin: 0 0 10px 0;
                font-size: 13px;
                color: var(--text-normal);
            }
            
            .selected-link-controls button {
                margin-top: 10px;
                padding: 6px 12px;
                background: var(--interactive-normal);
                color: var(--text-normal);
                border: 1px solid var(--background-modifier-border);
                border-radius: 4px;
                cursor: pointer;
                font-size: 12px;
                width: auto;
            }
            
            .selected-link-controls button:hover {
                background: var(--interactive-hover);
            }
        `;
        document.head.appendChild(style);
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
        
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
        }
    }
}

class BetterGraphSettingTab extends PluginSettingTab {
    plugin: BetterGraphPlugin;

    constructor(app: App, plugin: BetterGraphPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();
        containerEl.createEl('h2', { text: 'Better Graph View Settings' });

        // API Configuration
        containerEl.createEl('h3', { text: 'API Configuration' });

        new Setting(containerEl)
            .setName('OpenAI API Key')
            .setDesc('Required for generating semantic embeddings')
            .addText(text => text
                .setPlaceholder('sk-...')
                .setValue(this.plugin.settings.openaiApiKey)
                .onChange(async (value) => {
                    this.plugin.settings.openaiApiKey = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Pinecone API Key')
            .setDesc('Optional: For cloud storage of embeddings')
            .addText(text => text
                .setPlaceholder('Your Pinecone API key')
                .setValue(this.plugin.settings.pineconeApiKey)
                .onChange(async (value) => {
                    this.plugin.settings.pineconeApiKey = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Pinecone Environment')
            .setDesc('Your Pinecone environment')
            .addText(text => text
                .setPlaceholder('us-west1-gcp')
                .setValue(this.plugin.settings.pineconeEnvironment)
                .onChange(async (value) => {
                    this.plugin.settings.pineconeEnvironment = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Pinecone Index Name')
            .setDesc('Your Pinecone index name')
            .addText(text => text
                .setPlaceholder('obsidian-notes')
                .setValue(this.plugin.settings.pineconeIndexName)
                .onChange(async (value) => {
                    this.plugin.settings.pineconeIndexName = value;
                    await this.plugin.saveSettings();
                }));

        // Embedding Settings
        containerEl.createEl('h3', { text: 'Embedding Settings' });

        new Setting(containerEl)
            .setName('Similarity Threshold')
            .setDesc('Minimum similarity to create edges (0.1 = loose, 0.9 = strict)')
            .addSlider(slider => slider
                .setLimits(0.1, 0.9, 0.05)
                .setValue(this.plugin.settings.similarityThreshold)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    this.plugin.settings.similarityThreshold = value;
                    await this.plugin.saveSettings();
                }));

        // Actions
        containerEl.createEl('h3', { text: 'Actions' });

        new Setting(containerEl)
            .setName('Generate Embeddings')
            .setDesc('Process all notes to create semantic embeddings')
            .addButton(button => button
                .setButtonText('Generate Now')
                .setCta()
                .onClick(async () => {
                    if (!this.plugin.settings.openaiApiKey) {
                        new Notice('Please set your OpenAI API key first');
                        return;
                    }
                    button.setDisabled(true);
                    button.setButtonText('Generating...');
                    await this.plugin.generateEmbeddingsForAllNotes();
                    button.setDisabled(false);
                    button.setButtonText('Generate Now');
                }));

        new Setting(containerEl)
            .setName('Reset Customizations')
            .setDesc('Reset all custom link thickness settings')
            .addButton(button => button
                .setButtonText('Reset All')
                .setWarning()
                .onClick(async () => {
                    this.plugin.settings.linkThickness = {};
                    await this.plugin.saveSettings();
                    new Notice('All customizations reset');
                }));
    }
}