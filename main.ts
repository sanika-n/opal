import { Notice, Plugin } from 'obsidian';
import { BetterGraphView, VIEW_TYPE_GRAPH } from './graph/GraphView';
import { BetterGraphSettingTab } from './BetterGraphSettings';
import { BetterGraphSettings, DEFAULT_SETTINGS } from './types';
import { EmbeddingService } from './EmbeddingService';

export default class BetterGraphPlugin extends Plugin {
    settings: BetterGraphSettings;
    embeddingService: EmbeddingService;

    async onload() {
        await this.loadSettings();
        this.embeddingService = new EmbeddingService(this.settings);

        // Register the view
        this.registerView(
            VIEW_TYPE_GRAPH,
            (leaf) => new BetterGraphView(leaf, this)
        );

        // Add ribbon icon
        this.addRibbonIcon('dot-network', 'Better Graph View', () => {
            this.activateView();
        });

        // Add command to open graph
        this.addCommand({
            id: 'open-better-graph-view',
            name: 'Open Better Graph View',
            callback: () => {
                this.activateView();
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

    async activateView() {
        const { workspace } = this.app;
        
        let leaf = workspace.getLeavesOfType(VIEW_TYPE_GRAPH)[0];
        
        if (!leaf) {
            const newLeaf = workspace.getLeaf('tab');
            await newLeaf.setViewState({
                type: VIEW_TYPE_GRAPH,
                active: true,
            });
            leaf = newLeaf;
        }
        
        workspace.revealLeaf(leaf);
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
                    await this.storeEmbeddingLocally(file.path, embedding);
                }

                // Rate limiting
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
        data.settings = this.settings;
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
        
        if (this.embeddingService) {
            this.embeddingService.updateSettings(this.settings);
        }
    }

    onunload() {
        this.app.workspace.detachLeavesOfType(VIEW_TYPE_GRAPH);
    }
}