import { App, Notice, PluginSettingTab, Setting } from 'obsidian';
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

        new Setting(containerEl)
            .setName('Default Link Thickness')
            .setDesc('Default thickness for graph links')
            .addSlider(slider => slider
                .setLimits(0.5, 5, 0.5)
                .setValue(this.plugin.settings.defaultLinkThickness)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    this.plugin.settings.defaultLinkThickness = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Node Size')
            .setDesc('Size of graph nodes')
            .addSlider(slider => slider
                .setLimits(3, 10, 1)
                .setValue(this.plugin.settings.nodeSize)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    this.plugin.settings.nodeSize = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Link Distance')
            .setDesc('Distance between connected nodes')
            .addSlider(slider => slider
                .setLimits(30, 200, 10)
                .setValue(this.plugin.settings.linkDistance)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    this.plugin.settings.linkDistance = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Center Force')
            .setDesc('Strength of force pulling nodes to center')
            .addSlider(slider => slider
                .setLimits(0, 1, 0.1)
                .setValue(this.plugin.settings.centerForce)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    this.plugin.settings.centerForce = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Reset Link Thickness')
            .setDesc('Reset all custom link thickness values to default')
            .addButton(button => button
                .setButtonText('Reset')
                .setCta()
                .onClick(async () => {
                    this.plugin.settings.linkThickness = {};
                    await this.plugin.saveSettings();
                    new Notice('All link thickness values have been reset');
                }));
    }
}