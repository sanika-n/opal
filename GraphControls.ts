import { setIcon } from 'obsidian';
import type BetterGraphPlugin from './main';
import type { BetterGraphView } from './GraphView';

export class GraphControls {
    private container: HTMLElement;
    private plugin: BetterGraphPlugin;
    private view: BetterGraphView;
    private isAnimating: boolean = true;

    constructor(container: HTMLElement, plugin: BetterGraphPlugin, view: BetterGraphView) {
        this.container = container;
        this.plugin = plugin;
        this.view = view;
        this.render();
    }

    private render() {
        this.container.empty();
        this.container.addClass('graph-controls');

        // Filters section
        const filtersSection = this.createSection('Filters', true);
        
        // Search
        const searchContainer = filtersSection.createDiv('search-container');
        const searchInput = searchContainer.createEl('input', {
            type: 'text',
            placeholder: 'Search files...',
            cls: 'search-input'
        });
        const searchIcon = searchContainer.createDiv('search-icon');
        setIcon(searchIcon, 'search');

        // Toggles
        this.createToggle(filtersSection, 'Tags', false);
        this.createToggle(filtersSection, 'Attachments', false);
        this.createToggle(filtersSection, 'Existing files only', false);
        this.createToggle(filtersSection, 'Orphans', true);

        // Groups section
        const groupsSection = this.createSection('Groups');
        const newGroupBtn = groupsSection.createEl('button', {
            text: 'New group',
            cls: 'mod-cta full-width'
        });

        // Display section
        const displaySection = this.createSection('Display');
        
        this.createToggle(displaySection, 'Arrows', false);
        
        this.createSlider(displaySection, 'Text fade threshold', 0, 1, 0.1, 0.5);
        this.createSlider(displaySection, 'Node size', 
            5, 30, 1, this.plugin.settings.nodeSize,
            (value) => {
                this.plugin.settings.nodeSize = value;
                this.plugin.saveSettings();
                this.view.refresh();
            }
        );
        this.createSlider(displaySection, 'Link thickness',
            0.5, 5, 0.5, this.plugin.settings.defaultLinkThickness,
            (value) => {
                this.plugin.settings.defaultLinkThickness = value;
                this.plugin.saveSettings();
                this.view.refresh();
            }
        );

        // Animate button
        const animateBtn = displaySection.createEl('button', {
            text: this.isAnimating ? 'Stop animation' : 'Animate',
            cls: this.isAnimating ? 'mod-warning full-width' : 'mod-cta full-width'
        });
        animateBtn.addEventListener('click', () => {
            this.isAnimating = !this.isAnimating;
            animateBtn.textContent = this.isAnimating ? 'Stop animation' : 'Animate';
            animateBtn.className = this.isAnimating ? 'mod-warning full-width' : 'mod-cta full-width';
            if (this.view.renderer) {
                this.view.renderer.toggleAnimation(this.isAnimating);
            }
        });

        // Forces section
        const forcesSection = this.createSection('Forces');
        
        this.createSlider(forcesSection, 'Center force',
            0, 1, 0.05, this.plugin.settings.centerForce,
            (value) => {
                this.plugin.settings.centerForce = value;
                this.plugin.saveSettings();
                this.view.refresh();
            }
        );
        
        this.createSlider(forcesSection, 'Repel force',
            100, 1000, 50, this.plugin.settings.repulsionForce,
            (value) => {
                this.plugin.settings.repulsionForce = value;
                this.plugin.saveSettings();
                this.view.refresh();
            }
        );
        
        this.createSlider(forcesSection, 'Link force',
            0, 1, 0.05, 0.5
        );
        
        this.createSlider(forcesSection, 'Link distance',
            20, 200, 10, this.plugin.settings.linkDistance,
            (value) => {
                this.plugin.settings.linkDistance = value;
                this.plugin.saveSettings();
                this.view.refresh();
            }
        );

        // Add file count
        const fileCount = forcesSection.createDiv('file-count');
        fileCount.setText(`${this.view.nodes.length} files, ${this.view.links.length} links`);
    }

    private createSection(title: string, expanded: boolean = false): HTMLElement {
        const section = this.container.createDiv('control-section');
        const header = section.createDiv('section-header');
        
        const toggle = header.createDiv('section-toggle');
        setIcon(toggle, expanded ? 'chevron-down' : 'chevron-right');
        
        header.createSpan({ text: title, cls: 'section-title' });
        
        const content = section.createDiv('section-content');
        content.style.display = expanded ? 'block' : 'none';
        
        header.addEventListener('click', () => {
            const isExpanded = content.style.display === 'block';
            content.style.display = isExpanded ? 'none' : 'block';
            setIcon(toggle, isExpanded ? 'chevron-right' : 'chevron-down');
        });
        
        return content;
    }

    private createToggle(parent: HTMLElement, label: string, checked: boolean): HTMLElement {
        const container = parent.createDiv('toggle-container');
        container.createEl('label', { text: label });
        const toggle = container.createDiv('toggle');
        toggle.classList.toggle('is-enabled', checked);
        
        toggle.addEventListener('click', () => {
            toggle.classList.toggle('is-enabled');
        });
        
        return container;
    }

    private createSlider(
        parent: HTMLElement,
        label: string,
        min: number,
        max: number,
        step: number,
        value: number,
        onChange?: (value: number) => void
    ): HTMLElement {
        const container = parent.createDiv('slider-container');
        container.createEl('label', { text: label });
        
        const sliderWrapper = container.createDiv('slider-wrapper');
        const slider = sliderWrapper.createEl('input', {
            type: 'range',
            attr: { min: min.toString(), max: max.toString(), step: step.toString() }
        }) as HTMLInputElement;
        slider.value = value.toString();
        
        const valueDisplay = container.createDiv('slider-value');
        valueDisplay.setText(value.toString());
        
        if (onChange) {
            slider.addEventListener('input', (e) => {
                const newValue = parseFloat((e.target as HTMLInputElement).value);
                valueDisplay.setText(newValue.toString());
                onChange(newValue);
            });
        }
        
        return container;
    }
}