import { Notice } from 'obsidian';
import type BetterGraphPlugin from '../main';
import type { BetterGraphView } from '../GraphView';

export class GraphControls {
    private container: HTMLElement;
    private plugin: BetterGraphPlugin;
    private view: BetterGraphView;

    constructor(container: HTMLElement, plugin: BetterGraphPlugin, view: BetterGraphView) {
        this.container = container;
        this.plugin = plugin;
        this.view = view;
        this.render();
    }

    private render() {
        this.container.empty();
        
        const sections = [
            this.createEmbeddingSection(),
            this.createThicknessSection(),
            this.createPhysicsSection(),
            this.createActionsSection()
        ];
        
        sections.forEach(section => this.container.appendChild(section));
    }

    private createEmbeddingSection(): HTMLElement {
        const section = this.createSection('Semantic Similarity');
        
        // Use embeddings toggle
        const toggleControl = this.createControl(section, 'Use Semantic Similarity');
        const toggle = toggleControl.createEl('input', { type: 'checkbox' });
        toggle.checked = this.plugin.settings.useEmbeddings;
        toggle.addEventListener('change', async (e) => {
            this.plugin.settings.useEmbeddings = (e.target as HTMLInputElement).checked;
            await this.plugin.saveSettings();
            await this.view.refresh();
        });
        
        // Similarity threshold
        const thresholdControl = this.createSliderControl(
            section,
            'Similarity Threshold',
            this.plugin.settings.similarityThreshold,
            0.1, 0.9, 0.05,
            async (value) => {
                this.plugin.settings.similarityThreshold = value;
                await this.plugin.saveSettings();
                if (this.plugin.settings.useEmbeddings) {
                    await this.view.refresh();
                }
            }
        );
        
        // Generate embeddings button
        const btn = section.createEl('button', {
            text: 'Generate Embeddings',
            cls: 'graph-control-btn mod-cta'
        });
        btn.addEventListener('click', async () => {
            btn.disabled = true;
            btn.textContent = 'Generating...';
            await this.plugin.generateEmbeddingsForAllNotes();
            btn.disabled = false;
            btn.textContent = 'Generate Embeddings';
            await this.view.refresh();
        });
        
        return section;
    }

    private createThicknessSection(): HTMLElement {
        const section = this.createSection('Link Appearance');
        
        this.createSliderControl(
            section,
            'Default Thickness',
            this.plugin.settings.defaultLinkThickness,
            0.5, 10, 0.5,
            async (value) => {
                this.plugin.settings.defaultLinkThickness = value;
                await this.plugin.saveSettings();
            }
        );
        
        this.createSliderControl(
            section,
            'Min Thickness',
            this.plugin.settings.minLinkThickness,
            0.1, 5, 0.1,
            async (value) => {
                this.plugin.settings.minLinkThickness = value;
                await this.plugin.saveSettings();
            }
        );
        
        this.createSliderControl(
            section,
            'Max Thickness',
            this.plugin.settings.maxLinkThickness,
            2, 15, 0.5,
            async (value) => {
                this.plugin.settings.maxLinkThickness = value;
                await this.plugin.saveSettings();
            }
        );
        
        return section;
    }

    private createPhysicsSection(): HTMLElement {
        const section = this.createSection('Physics');
        
        this.createSliderControl(
            section,
            'Node Size',
            this.plugin.settings.nodeSize,
            3, 20, 1,
            async (value) => {
                this.plugin.settings.nodeSize = value;
                await this.plugin.saveSettings();
            }
        );
        
        this.createSliderControl(
            section,
            'Repulsion Force',
            this.plugin.settings.repulsionForce,
            100, 1000, 50,
            async (value) => {
                this.plugin.settings.repulsionForce = value;
                await this.plugin.saveSettings();
            }
        );
        
        this.createSliderControl(
            section,
            'Link Distance',
            this.plugin.settings.linkDistance,
            50, 200, 10,
            async (value) => {
                this.plugin.settings.linkDistance = value;
                await this.plugin.saveSettings();
            }
        );
        
        this.createSliderControl(
            section,
            'Center Force',
            this.plugin.settings.centerForce,
            0, 1, 0.1,
            async (value) => {
                this.plugin.settings.centerForce = value;
                await this.plugin.saveSettings();
            }
        );
        
        return section;
    }

    private createActionsSection(): HTMLElement {
        const section = this.createSection('Actions');
        
        const resetBtn = section.createEl('button', {
            text: 'Reset All Customizations',
            cls: 'graph-control-btn mod-warning'
        });
        resetBtn.addEventListener('click', async () => {
            this.plugin.settings.linkThickness = {};
            await this.plugin.saveSettings();
            new Notice('All customizations have been reset');
            await this.view.refresh();
        });
        
        return section;
    }

    private createSection(title: string): HTMLElement {
        const section = document.createElement('div');
        section.className = 'graph-control-section';
        section.createEl('h3', { text: title });
        return section;
    }

    private createControl(parent: HTMLElement, label: string): HTMLElement {
        const control = parent.createDiv('graph-control-item');
        control.createEl('label', { text: label });
        return control;
    }

    private createSliderControl(
        parent: HTMLElement,
        label: string,
        value: number,
        min: number,
        max: number,
        step: number,
        onChange: (value: number) => void
    ): HTMLElement {
        const control = this.createControl(parent, label);
        const sliderContainer = control.createDiv('slider-container');
        
        const slider = sliderContainer.createEl('input', {
            type: 'range',
            attr: { min: min.toString(), max: max.toString(), step: step.toString() }
        }) as HTMLInputElement;
        slider.value = value.toString();
        
        const valueDisplay = sliderContainer.createEl('span', {
            text: value.toString(),
            cls: 'slider-value'
        });
        
        slider.addEventListener('input', (e) => {
            const newValue = parseFloat((e.target as HTMLInputElement).value);
            valueDisplay.textContent = newValue.toString();
            onChange(newValue);
        });
        
        return control;
    }
}