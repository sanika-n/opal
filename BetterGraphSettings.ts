import { App, PluginSettingTab, Setting, Notice } from 'obsidian';
import type BetterGraphPlugin from './main';

export class BetterGraphSettingTab extends PluginSettingTab {
    plugin: BetterGraphPlugin;

    constructor(app: App, plugin: BetterGraphPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        containerEl.createEl('h2', { text: 'Better Graph View Settings' });

        // API Configuration Section
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
            .setDesc('Your Pinecone environment (e.g., us-west1-gcp)')
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

        // Embedding Settings Section
        containerEl.createEl('h3', { text: 'Embedding Settings' });

        new Setting(containerEl)
            .setName('Use Semantic Similarity')
            .setDesc('Create links based on semantic similarity instead of explicit links')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.useEmbeddings)
                .onChange(async (value) => {
                    this.plugin.settings.useEmbeddings = value;
                    await this.plugin.saveSettings();
                }));

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

        // Graph Display Settings
        containerEl.createEl('h3', { text: 'Graph Display' });

        new Setting(containerEl)
            .setName('Node Size')
            .setDesc('Size of nodes in the graph')
            .addSlider(slider => slider
                .setLimits(5, 30, 1)
                .setValue(this.plugin.settings.nodeSize)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    this.plugin.settings.nodeSize = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Link Distance')
            .setDesc('Default distance between connected nodes')
            .addSlider(slider => slider
                .setLimits(20, 200, 10)
                .setValue(this.plugin.settings.linkDistance)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    this.plugin.settings.linkDistance = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Repulsion Force')
            .setDesc('How strongly nodes push each other away')
            .addSlider(slider => slider
                .setLimits(100, 1000, 50)
                .setValue(this.plugin.settings.repulsionForce)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    this.plugin.settings.repulsionForce = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Center Force')
            .setDesc('How strongly nodes are pulled to the center')
            .addSlider(slider => slider
                .setLimits(0, 1, 0.05)
                .setValue(this.plugin.settings.centerForce)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    this.plugin.settings.centerForce = value;
                    await this.plugin.saveSettings();
                }));

        // Link Thickness Settings
        containerEl.createEl('h3', { text: 'Link Thickness' });

        new Setting(containerEl)
            .setName('Default Link Thickness')
            .setDesc('Thickness for traditional links')
            .addSlider(slider => slider
                .setLimits(0.5, 10, 0.5)
                .setValue(this.plugin.settings.defaultLinkThickness)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    this.plugin.settings.defaultLinkThickness = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Minimum Link Thickness')
            .setDesc('Minimum thickness for similarity-based links')
            .addSlider(slider => slider
                .setLimits(0.1, 5, 0.1)
                .setValue(this.plugin.settings.minLinkThickness)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    this.plugin.settings.minLinkThickness = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Maximum Link Thickness')
            .setDesc('Maximum thickness for similarity-based links')
            .addSlider(slider => slider
                .setLimits(2, 15, 0.5)
                .setValue(this.plugin.settings.maxLinkThickness)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    this.plugin.settings.maxLinkThickness = value;
                    await this.plugin.saveSettings();
                }));

        // Actions Section
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
                    try {
                        await this.plugin.generateEmbeddingsForAllNotes();
                    } finally {
                        button.setDisabled(false);
                        button.setButtonText('Generate Now');
                    }
                }));

        new Setting(containerEl)
            .setName('Clear All Embeddings')
            .setDesc('Remove all stored embeddings')
            .addButton(button => button
                .setButtonText('Clear Embeddings')
                .setWarning()
                .onClick(async () => {
                    const data = await this.plugin.loadData() || {};
                    data.embeddings = {};
                    await this.plugin.saveData(data);
                    new Notice('All embeddings cleared');
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

        // Embedding Status
        containerEl.createEl('h3', { text: 'Embedding Status' });
        const statusContainer = containerEl.createDiv('embedding-status');
        this.updateEmbeddingStatus(statusContainer);
    }

    async updateEmbeddingStatus(container: HTMLElement) {
        container.empty();
        
        const data = await this.plugin.loadData() || {};
        const embeddings = data.embeddings || {};
        const totalFiles = this.plugin.app.vault.getMarkdownFiles().length;
        const embeddedFiles = Object.keys(embeddings).length;
        
        const status = container.createEl('p', {
            text: `${embeddedFiles} of ${totalFiles} files have embeddings`,
            cls: 'setting-item-description'
        });

        if (embeddedFiles > 0) {
            const percentage = Math.round((embeddedFiles / totalFiles) * 100);
            const progressBar = container.createDiv('embedding-progress');
            progressBar.style.cssText = `
                width: 100%;
                height: 4px;
                background: var(--background-modifier-border);
                border-radius: 2px;
                margin-top: 8px;
            `;
            const progress = progressBar.createDiv();
            progress.style.cssText = `
                width: ${percentage}%;
                height: 100%;
                background: var(--interactive-accent);
                border-radius: 2px;
                transition: width 0.3s ease;
            `;
        }
    }
}