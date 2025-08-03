import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, TFile, WorkspaceLeaf } from 'obsidian';

interface LinkThickness {
	[linkId: string]: number;
}

interface MyPluginSettings {
	defaultLinkThickness: number;
	linkThickness: LinkThickness;
	nodeSize: number;
	repulsionForce: number;
	linkDistance: number;
}

const DEFAULT_SETTINGS: MyPluginSettings = {
	defaultLinkThickness: 2,
	linkThickness: {},
	nodeSize: 8,
	repulsionForce: 300,
	linkDistance: 100
}

interface GraphNode {
	id: string;
	name: string;
	x: number;
	y: number;
	vx: number;
	vy: number;
}

interface GraphLink {
	source: string;
	target: string;
	id: string;
}

export default class MyPlugin extends Plugin {
	settings: MyPluginSettings;

	async onload() {
		await this.loadSettings();

		// This creates an icon in the left ribbon.
		const ribbonIconEl = this.addRibbonIcon('dot-network', 'Better Graph View', (evt: MouseEvent) => {
			new BetterGraphModal(this.app, this).open();
		});
		ribbonIconEl.addClass('my-plugin-ribbon-class');

		// This adds a simple command that can be triggered anywhere
		this.addCommand({
			id: 'open-better-graph-view',
			name: 'Open Better Graph View',
			callback: () => {
				new BetterGraphModal(this.app, this).open();
			}
		});

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new SampleSettingTab(this.app, this));
	}

	onunload() {

	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

class BetterGraphModal extends Modal {
	plugin: MyPlugin;
	canvas: HTMLCanvasElement;
	ctx: CanvasRenderingContext2D;
	nodes: GraphNode[] = [];
	links: GraphLink[] = [];
	selectedLink: GraphLink | null = null;
	isDragging = false;
	dragNode: GraphNode | null = null;
	animationId: number;
	controlsEl: HTMLElement;

	constructor(app: App, plugin: MyPlugin) {
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
		const title = this.controlsEl.createEl('h3', { text: 'Graph Controls' });
		
		// Global settings
		const globalSection = this.controlsEl.createDiv('control-section');
		globalSection.createEl('h4', { text: 'Global Settings' });
		
		// Default link thickness
		const thicknessContainer = globalSection.createDiv('control-item');
		thicknessContainer.createEl('label', { text: 'Default Link Thickness:' });
		const thicknessSlider = thicknessContainer.createEl('input', {
			type: 'range',
			attr: { min: '1', max: '10', step: '0.5' }
		});
		thicknessSlider.value = this.plugin.settings.defaultLinkThickness.toString();
		const thicknessValue = thicknessContainer.createEl('span', { 
			text: this.plugin.settings.defaultLinkThickness.toString() 
		});
		
		thicknessSlider.addEventListener('input', (e) => {
			const value = parseFloat((e.target as HTMLInputElement).value);
			this.plugin.settings.defaultLinkThickness = value;
			thicknessValue.setText(value.toString());
			this.plugin.saveSettings();
		});
		
		// Node size
		const nodeSizeContainer = globalSection.createDiv('control-item');
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
		
		// Individual link controls
		const linkSection = this.controlsEl.createDiv('control-section');
		linkSection.createEl('h4', { text: 'Individual Link Controls' });
		const linkInfo = linkSection.createEl('p', { 
			text: 'Click on a link in the graph to customize its thickness' 
		});
		linkInfo.addClass('link-info');
	}

	loadGraphData() {
		const files = this.app.vault.getMarkdownFiles();
		const nodeMap = new Map<string, GraphNode>();
		
		// Create nodes for each file
		files.forEach(file => {
			nodeMap.set(file.path, {
				id: file.path,
				name: file.basename,
				x: Math.random() * 700 + 50,
				y: Math.random() * 500 + 50,
				vx: 0,
				vy: 0
			});
		});
		
		this.nodes = Array.from(nodeMap.values());
		
		// Create links based on file connections
		this.links = [];
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
		
		// Check if clicking on a node
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
		
		// Check if clicking on a link
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
		// Remove existing link controls
		const existingControls = this.controlsEl.querySelector('.selected-link-controls');
		if (existingControls) {
			existingControls.remove();
		}
		
		if (!this.selectedLink) return;
		
		const linkControlsSection = this.controlsEl.createDiv('selected-link-controls');
		linkControlsSection.createEl('h4', { text: 'Selected Link' });
		
		const sourceNode = this.nodes.find(n => n.id === this.selectedLink!.source);
		const targetNode = this.nodes.find(n => n.id === this.selectedLink!.target);
		
		linkControlsSection.createEl('p', { 
			text: `${sourceNode?.name} → ${targetNode?.name}` 
		});
		
		const currentThickness = this.plugin.settings.linkThickness[this.selectedLink.id] || this.plugin.settings.defaultLinkThickness;
		
		const thicknessContainer = linkControlsSection.createDiv('control-item');
		thicknessContainer.createEl('label', { text: 'Link Thickness:' });
		const thicknessSlider = thicknessContainer.createEl('input', {
			type: 'range',
			attr: { min: '0.5', max: '15', step: '0.5' }
		});
		thicknessSlider.value = currentThickness.toString();
		const thicknessValue = thicknessContainer.createEl('span', { 
			text: currentThickness.toString() 
		});
		
		thicknessSlider.addEventListener('input', (e) => {
			const value = parseFloat((e.target as HTMLInputElement).value);
			this.plugin.settings.linkThickness[this.selectedLink!.id] = value;
			thicknessValue.setText(value.toString());
			this.plugin.saveSettings();
		});
		
		// Reset button
		const resetBtn = linkControlsSection.createEl('button', { text: 'Reset to Default' });
		resetBtn.addEventListener('click', () => {
			delete this.plugin.settings.linkThickness[this.selectedLink!.id];
			thicknessSlider.value = this.plugin.settings.defaultLinkThickness.toString();
			thicknessValue.setText(this.plugin.settings.defaultLinkThickness.toString());
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
				node.vx *= 0.9; // damping
				node.vy *= 0.9;
				node.x += node.vx * alpha;
				node.y += node.vy * alpha;
				
				// Keep nodes within canvas bounds
				node.x = Math.max(20, Math.min(this.canvas.width - 20, node.x));
				node.y = Math.max(20, Math.min(this.canvas.height - 20, node.y));
			}
		}
	}

	draw() {
		// Clear canvas
		this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
		
		// Draw links
		for (const link of this.links) {
			const sourceNode = this.nodes.find(n => n.id === link.source);
			const targetNode = this.nodes.find(n => n.id === link.target);
			
			if (sourceNode && targetNode) {
				const thickness = this.plugin.settings.linkThickness[link.id] || this.plugin.settings.defaultLinkThickness;
				const isSelected = this.selectedLink?.id === link.id;
				
				this.ctx.beginPath();
				this.ctx.moveTo(sourceNode.x, sourceNode.y);
				this.ctx.lineTo(targetNode.x, targetNode.y);
				this.ctx.lineWidth = thickness;
				this.ctx.strokeStyle = isSelected ? '#ff6b6b' : 'var(--text-muted)';
				this.ctx.stroke();
			}
		}
		
		// Draw nodes
		for (const node of this.nodes) {
			this.ctx.beginPath();
			this.ctx.arc(node.x, node.y, this.plugin.settings.nodeSize, 0, 2 * Math.PI);
			this.ctx.fillStyle = 'var(--interactive-accent)';
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
				max-width: 1200px;
				max-height: 800px;
			}
			
			.graph-container {
				display: flex;
				height: 100%;
				gap: 20px;
			}
			
			.graph-controls {
				width: 250px;
				padding: 10px;
				background: var(--background-secondary);
				border-radius: 8px;
				overflow-y: auto;
			}
			
			.control-section {
				margin-bottom: 20px;
			}
			
			.control-section h4 {
				margin: 0 0 10px 0;
				color: var(--text-accent);
			}
			
			.control-item {
				margin-bottom: 10px;
			}
			
			.control-item label {
				display: block;
				margin-bottom: 5px;
				font-size: 12px;
				color: var(--text-muted);
			}
			
			.control-item input[type="range"] {
				width: 100%;
			}
			
			.control-item span {
				font-weight: bold;
				color: var(--text-accent);
			}
			
			.link-info {
				font-size: 11px;
				color: var(--text-muted);
				font-style: italic;
			}
			
			.selected-link-controls {
				border-top: 1px solid var(--background-modifier-border);
				padding-top: 15px;
				margin-top: 15px;
			}
			
			.selected-link-controls button {
				margin-top: 10px;
				padding: 5px 10px;
				background: var(--interactive-accent);
				color: var(--text-on-accent);
				border: none;
				border-radius: 4px;
				cursor: pointer;
			}
			
			.selected-link-controls button:hover {
				background: var(--interactive-accent-hover);
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

class SampleSettingTab extends PluginSettingTab {
	plugin: MyPlugin;

	constructor(app: App, plugin: MyPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		containerEl.createEl('h2', { text: 'Better Graph View Settings' });

		new Setting(containerEl)
			.setName('Default Link Thickness')
			.setDesc('Default thickness for all links in the graph')
			.addSlider(slider => slider
				.setLimits(0.5, 10, 0.5)
				.setValue(this.plugin.settings.defaultLinkThickness)
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.plugin.settings.defaultLinkThickness = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Node Size')
			.setDesc('Size of the nodes in the graph')
			.addSlider(slider => slider
				.setLimits(3, 20, 1)
				.setValue(this.plugin.settings.nodeSize)
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.plugin.settings.nodeSize = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Repulsion Force')
			.setDesc('How strongly nodes repel each other')
			.addSlider(slider => slider
				.setLimits(100, 1000, 50)
				.setValue(this.plugin.settings.repulsionForce)
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.plugin.settings.repulsionForce = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Link Distance')
			.setDesc('Preferred distance between connected nodes')
			.addSlider(slider => slider
				.setLimits(50, 200, 10)
				.setValue(this.plugin.settings.linkDistance)
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.plugin.settings.linkDistance = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Reset Link Customizations')
			.setDesc('Remove all individual link thickness customizations')
			.addButton(button => button
				.setButtonText('Reset All')
				.setWarning()
				.onClick(async () => {
					this.plugin.settings.linkThickness = {};
					await this.plugin.saveSettings();
					new Notice('All link customizations have been reset');
				}));
	}
}