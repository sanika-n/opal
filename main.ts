// main.ts
import { App, Plugin, PluginSettingTab, Setting, TFile, Notice, requestUrl } from 'obsidian';
import { BetterGraphView, VIEW_TYPE_GRAPH } from './GraphView';
import { BetterGraphSettingTab } from './BetterGraphSettings';
import { BetterGraphSettings, DEFAULT_SETTINGS } from './types';
import { EmbeddingService } from './EmbeddingService';

interface CombinedPluginSettings extends BetterGraphSettings {
	openaiApiKey: string;
}

const COMBINED_DEFAULT_SETTINGS: CombinedPluginSettings = {
	...DEFAULT_SETTINGS,
	openaiApiKey: ''
}

export default class CombinedPlugin extends Plugin {
    settings: CombinedPluginSettings;
    embeddingService: EmbeddingService;

    async onload() {
        await this.loadSettings();
        this.embeddingService = new EmbeddingService(this.settings);

        // Register the Better Graph view
        this.registerView(
            VIEW_TYPE_GRAPH,
            (leaf) => new BetterGraphView(leaf, this)
        );

        // Better Graph ribbon icon
        this.addRibbonIcon('dot-network', 'Better Graph View', () => {
            this.activateView();
        });

        // AI Summary & Tags ribbon icon
        this.addRibbonIcon('bot', 'Generate AI Summary & Tags', () => {
            this.generateSummaryAndTags();
        });

        // Better Graph commands
        this.addCommand({
            id: 'open-better-graph-view',
            name: 'Open Better Graph View',
            callback: () => {
                this.activateView();
            }
        });

        this.addCommand({
            id: 'generate-embeddings',
            name: 'Generate Embeddings for All Notes',
            callback: async () => {
                await this.generateEmbeddingsForAllNotes();
            }
        });

        // AI Summary & Tags command
        this.addCommand({
            id: 'generate-summary-tags',
            name: 'Generate Summary and Tags',
            callback: () => {
                this.generateSummaryAndTags();
            }
        });

        // Add combined settings tab
        this.addSettingTab(new CombinedSettingTab(this.app, this));
    }

    // Better Graph Methods
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

    // AI Summary & Tags Methods
    async generateSummaryAndTags() {
        const activeFile = this.app.workspace.getActiveFile();
        if (!activeFile) {
            new Notice('No active file');
            return;
        }

        if (!this.settings.openaiApiKey) {
            new Notice('Please set your OpenAI API key in settings');
            return;
        }

        try {
            const content = await this.app.vault.read(activeFile);
            const cleanContent = this.cleanContent(content);

            if (cleanContent.length < 50) {
                new Notice('File content too short for analysis');
                return;
            }

            new Notice('Generating summary and tags...');

            const [summary, tags] = await Promise.all([
                this.callOpenAI('Please provide a brief summary of the following text in 2-3 sentences:\n\n' + cleanContent),
                this.callOpenAI('Generate 3-5 relevant tags for the following text. Return only the tags separated by commas:\n\n' + cleanContent)
            ]);

            await this.updateFileWithResults(activeFile, summary, tags);
            new Notice('Summary and tags generated!');

        } catch (error) {
            console.error('Error:', error);
            new Notice('Error: ' + error.message);
        }
    }

    cleanContent(content: string): string {
        // Remove existing frontmatter
        content = content.replace(/^---\n[\s\S]*?\n---\n/, '');
        // Remove markdown formatting
        content = content.replace(/[#*_`]/g, '');
        // Remove extra whitespace
        content = content.replace(/\n{3,}/g, '\n\n').trim();
        // Limit content length
        return content.slice(0, 6000);
    }

    async callOpenAI(prompt: string): Promise<string> {
        const response = await requestUrl({
            url: 'https://api.openai.com/v1/chat/completions',
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.settings.openaiApiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: 'gpt-3.5-turbo',
                messages: [{ role: 'user', content: prompt }],
                max_tokens: 300,
                temperature: 0.7,
            }),
        });

        if (response.status !== 200) {
            throw new Error(`API error: ${response.status}`);
        }

        const data = response.json;
        return data.choices[0].message.content.trim();
    }

    async updateFileWithResults(file: TFile, summary: string, tags: string) {
        const content = await this.app.vault.read(file);
        const frontmatterRegex = /^---\n([\s\S]*?)\n---\n/;
        const match = content.match(frontmatterRegex);

        let frontmatter = '';
        let bodyContent = content;

        if (match) {
            frontmatter = match[1];
            bodyContent = content.replace(frontmatterRegex, '');
        }

        // Parse existing frontmatter
        const frontmatterLines = frontmatter.split('\n').filter(line => line.trim());
        const frontmatterObj: { [key: string]: any } = {};

        frontmatterLines.forEach(line => {
            const colonIndex = line.indexOf(':');
            if (colonIndex > -1) {
                const key = line.substring(0, colonIndex).trim();
                const value = line.substring(colonIndex + 1).trim();
                frontmatterObj[key] = value;
            }
        });

        // Add AI results
        frontmatterObj['ai-summary'] = `"${summary.replace(/"/g, '\\"')}"`;
        
        const tagArray = tags.split(',').map(tag => tag.trim().replace(/^#/, ''));
        frontmatterObj['ai-tags'] = `[${tagArray.map(tag => `"${tag}"`).join(', ')}]`;

        // Build new content
        const newFrontmatterLines = Object.entries(frontmatterObj).map(([key, value]) => `${key}: ${value}`);
        const newContent = `---\n${newFrontmatterLines.join('\n')}\n---\n${bodyContent}`;

        await this.app.vault.modify(file, newContent);
    }

    // Combined Settings Methods
    async loadSettings() {
        const data = await this.loadData();
        this.settings = Object.assign({}, COMBINED_DEFAULT_SETTINGS, data?.settings || data || {});
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

class CombinedSettingTab extends PluginSettingTab {
    plugin: CombinedPlugin;

    constructor(app: App, plugin: CombinedPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        containerEl.createEl('h2', { text: 'Better Graph & AI Tools Settings' });

        // AI Summary & Tags Settings
        containerEl.createEl('h3', { text: 'AI Summary & Tags' });
        
        new Setting(containerEl)
            .setName('OpenAI API Key')
            .setDesc('Enter your OpenAI API key (used for both embeddings and summary/tags)')
            .addText(text => text
                .setPlaceholder('sk-...')
                .setValue(this.plugin.settings.openaiApiKey)
                .onChange(async (value) => {
                    this.plugin.settings.openaiApiKey = value;
                    await this.plugin.saveSettings();
                }));

        // Better Graph Settings would go here
        containerEl.createEl('h3', { text: 'Better Graph Settings' });
        containerEl.createEl('p', { text: 'Better Graph settings will be displayed here based on your BetterGraphSettings configuration.' });
    }
}