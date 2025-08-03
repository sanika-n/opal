import { Notice, Plugin } from 'obsidian';
import { BetterGraphView, VIEW_TYPE_GRAPH } from './GraphView';
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
        
        let successCount = 0;
        let errorCount = 0;
        let tokensSaved = 0;
        
        try {
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                notice.setMessage(`Generating embeddings... ${i + 1}/${files.length}`);
                
                try {
                    const content = await this.app.vault.read(file);
                    
                    // Extract only headings and first 100 words
                    const cleanContent = this.embeddingService.cleanTextForEmbedding(content);
                    
                    if (cleanContent.trim()) {
                        // Optional: Show token savings
                        const fullContent = content.replace(/---[\s\S]*?---\n?/m, '').trim();
                        const fullTokens = this.embeddingService.estimateTokenCount(fullContent);
                        const reducedTokens = this.embeddingService.estimateTokenCount(cleanContent);
                        tokensSaved += (fullTokens - reducedTokens);
                        
                        const embedding = await this.embeddingService.getEmbedding(cleanContent);
                        await this.storeEmbeddingLocally(file.path, embedding);
                        
                        // Store metadata about what was embedded
                        const metadata = {
                            embeddedAt: new Date().toISOString(),
                            method: 'headings-and-first-100-words',
                            textLength: cleanContent.length
                        };
                        await this.storeEmbeddingMetadata(file.path, metadata);
                        
                        successCount++;
                    } else {
                        console.log(`Skipping empty file: ${file.path}`);
                    }
                } catch (error) {
                    console.error(`Error processing file ${file.path}:`, error);
                    errorCount++;
                }

                // Rate limiting - adjust as needed
                await new Promise(resolve => setTimeout(resolve, 200));
            }
            
            notice.hide();
            
            const message = `Generated embeddings for ${successCount} notes` + 
                (errorCount > 0 ? ` (${errorCount} errors)` : '') +
                `\nEstimated tokens saved: ${tokensSaved.toLocaleString()}`;
            
            new Notice(message, 5000);
        } catch (error) {
            notice.hide();
            new Notice(`Error generating embeddings: ${error.message}`);
            console.error('Embedding generation error:', error);
        }
    }

    // Add this helper method to store metadata
    async storeEmbeddingMetadata(filePath: string, metadata: any): Promise<void> {
        const data = await this.loadData() || {};
        if (!data.embeddingMetadata) {
            data.embeddingMetadata = {};
        }
        data.embeddingMetadata[filePath] = metadata;
        await this.saveData(data);
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