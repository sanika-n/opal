import { Plugin } from 'obsidian';
import { BetterGraphModal } from './BetterGraphModal';
import { BetterGraphSettingTab } from './BetterGraphSettings';
import { BetterGraphSettings, DEFAULT_SETTINGS } from './types';

export default class BetterGraphPlugin extends Plugin {
    settings: BetterGraphSettings;

    async onload() {
        await this.loadSettings();

        // Add ribbon icon
        const ribbonIconEl = this.addRibbonIcon('dot-network', 'Better Graph View', (evt: MouseEvent) => {
            new BetterGraphModal(this.app, this).open();
        });
        ribbonIconEl.addClass('better-graph-ribbon');

        // Add command
        this.addCommand({
            id: 'open-better-graph-view',
            name: 'Open Better Graph View',
            callback: () => {
                new BetterGraphModal(this.app, this).open();
            }
        });

        // Add settings tab
        this.addSettingTab(new BetterGraphSettingTab(this.app, this));
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }
}