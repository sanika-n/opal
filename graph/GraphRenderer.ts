import type BetterGraphPlugin from '../main';
import { GraphNode, GraphLink } from '../types';

export class GraphRenderer {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private plugin: BetterGraphPlugin;
    private nodes: GraphNode[] = [];
    private links: GraphLink[] = [];
    private animationId: number;
    private camera = { x: 0, y: 0, zoom: 1 };
    private particles: Particle[] = [];
    private hoveredNode: GraphNode | null = null;
    private selectedNode: GraphNode | null = null;
    private isDragging = false;
    private dragNode: GraphNode | null = null;
    private mousePos = { x: 0, y: 0 };

    constructor(canvas: HTMLCanvasElement, plugin: BetterGraphPlugin) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d')!;
        this.plugin = plugin;
        this.setupEventListeners();
    }

    initialize(nodes: GraphNode[], links: GraphLink[]) {
        this.nodes = nodes;
        this.links = links;
        this.initializeLayout();
        this.createParticles();
        this.startAnimation();
    }

    private initializeLayout() {
        const centerX = this.canvas.width / 2;
        const centerY = this.canvas.height / 2;
        const radius = Math.min(centerX, centerY) * 0.7;

        // Initialize nodes in a circular layout
        this.nodes.forEach((node, i) => {
            const angle = (i / this.nodes.length) * Math.PI * 2;
            node.x = centerX + Math.cos(angle) * radius;
            node.y = centerY + Math.sin(angle) * radius;
            node.vx = 0;
            node.vy = 0;
        });
    }

    private createParticles() {
        this.particles = [];
        for (let i = 0; i < 50; i++) {
            this.particles.push({
                x: Math.random() * this.canvas.width,
                y: Math.random() * this.canvas.height,
                vx: (Math.random() - 0.5) * 0.5,
                vy: (Math.random() - 0.5) * 0.5,
                size: Math.random() * 2 + 1,
                opacity: Math.random() * 0.3 + 0.1
            });
        }
    }

    private setupEventListeners() {
        this.canvas.addEventListener('mousedown', this.onMouseDown.bind(this));
        this.canvas.addEventListener('mousemove', this.onMouseMove.bind(this));
        this.canvas.addEventListener('mouseup', this.onMouseUp.bind(this));
        this.canvas.addEventListener('wheel', this.onWheel.bind(this));
        this.canvas.addEventListener('dblclick', this.onDoubleClick.bind(this));
    }

    private onMouseDown(e: MouseEvent) {
        const rect = this.canvas.getBoundingClientRect();
        const x = (e.clientX - rect.left - this.camera.x) / this.camera.zoom;
        const y = (e.clientY - rect.top - this.camera.y) / this.camera.zoom;
        
        for (const node of this.nodes) {
            const dx = x - node.x;
            const dy = y - node.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance < this.plugin.settings.nodeSize + 5) {
                this.isDragging = true;
                this.dragNode = node;
                this.selectedNode = node;
                break;
            }
        }
    }

    private onMouseMove(e: MouseEvent) {
        const rect = this.canvas.getBoundingClientRect();
        this.mousePos.x = (e.clientX - rect.left - this.camera.x) / this.camera.zoom;
        this.mousePos.y = (e.clientY - rect.top - this.camera.y) / this.camera.zoom;
        
        if (this.isDragging && this.dragNode) {
            this.dragNode.x = this.mousePos.x;
            this.dragNode.y = this.mousePos.y;
            this.dragNode.vx = 0;
            this.dragNode.vy = 0;
        } else {
            // Check for hover
            this.hoveredNode = null;
            for (const node of this.nodes) {
                const dx = this.mousePos.x - node.x;
                const dy = this.mousePos.y - node.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                
                if (distance < this.plugin.settings.nodeSize + 5) {
                    this.hoveredNode = node;
                    this.canvas.style.cursor = 'pointer';
                    break;
                }
            }
            
            if (!this.hoveredNode) {
                this.canvas.style.cursor = 'grab';
            }
        }
    }

    private onMouseUp(e: MouseEvent) {
        this.isDragging = false;
        this.dragNode = null;
    }

    private onWheel(e: WheelEvent) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? 0.9 : 1.1;
        this.camera.zoom *= delta;
        this.camera.zoom = Math.max(0.1, Math.min(4, this.camera.zoom));
    }

    private onDoubleClick(e: MouseEvent) {
        if (this.selectedNode) {
            const file = this.plugin.app.vault.getAbstractFileByPath(this.selectedNode.path);
            if (file) {
                this.plugin.app.workspace.getLeaf().openFile(file);
            }
        }
    }

    private startAnimation() {
        const animate = () => {
            this.update();
            this.render();
            this.animationId = requestAnimationFrame(animate);
        };
        animate();
    }

    private update() {
        // Update physics
        this.updatePhysics();
        
        // Update particles
        this.updateParticles();
    }

    private updatePhysics() {
        const alpha = 0.1;
        const centerX = this.canvas.width / 2;
        const centerY = this.canvas.height / 2;
        
        // Apply forces
        for (let i = 0; i < this.nodes.length; i++) {
            const nodeA = this.nodes[i];
            
            // Center force
            const dx = centerX - nodeA.x;
            const dy = centerY - nodeA.y;
            nodeA.vx += dx * 0.0001 * this.plugin.settings.centerForce;
            nodeA.vy += dy * 0.0001 * this.plugin.settings.centerForce;
            
            // Repulsion between nodes
            for (let j = i + 1; j < this.nodes.length; j++) {
                const nodeB = this.nodes[j];
                const dx = nodeB.x - nodeA.x;
                const dy = nodeB.y - nodeA.y;
                const distance = Math.sqrt(dx * dx + dy * dy) || 1;
                
                if (distance < 200) {
                    const force = this.plugin.settings.repulsionForce / (distance * distance);
                    const fx = (dx / distance) * force;
                    const fy = (dy / distance) * force;
                    
                    nodeA.vx -= fx;
                    nodeA.vy -= fy;
                    nodeB.vx += fx;
                    nodeB.vy += fy;
                }
            }
        }
        
        // Spring forces for links
        for (const link of this.links) {
            const source = this.nodes.find(n => n.id === link.source);
            const target = this.nodes.find(n => n.id === link.target);
            
            if (source && target) {
                const dx = target.x - source.x;
                const dy = target.y - source.y;
                const distance = Math.sqrt(dx * dx + dy * dy) || 1;
                const targetDistance = this.plugin.settings.linkDistance;
                const force = (distance - targetDistance) * 0.1;
                
                const fx = (dx / distance) * force;
                const fy = (dy / distance) * force;
                
                source.vx += fx;
                source.vy += fy;
                target.vx -= fx;
                target.vy -= fy;
            }
        }
        
        // Update positions
        for (const node of this.nodes) {
            if (!this.isDragging || this.dragNode !== node) {
                node.vx *= 0.85; // Damping
                node.vy *= 0.85;
                node.x += node.vx * alpha;
                node.y += node.vy * alpha;
            }
        }
    }

    private updateParticles() {
        for (const particle of this.particles) {
            particle.x += particle.vx;
            particle.y += particle.vy;
            
            // Wrap around edges
            if (particle.x < 0) particle.x = this.canvas.width;
            if (particle.x > this.canvas.width) particle.x = 0;
            if (particle.y < 0) particle.y = this.canvas.height;
            if (particle.y > this.canvas.height) particle.y = 0;
        }
    }

    private render() {
        // Clear canvas
        this.ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--background-primary');
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Save context state
        this.ctx.save();
        
        // Apply camera transform
        this.ctx.translate(this.camera.x, this.camera.y);
        this.ctx.scale(this.camera.zoom, this.camera.zoom);
        
        // Draw particles (background effect)
        this.renderParticles();
        
        // Draw links
        this.renderLinks();
        
        // Draw nodes
        this.renderNodes();
        
        // Restore context state
        this.ctx.restore();
        
        // Draw UI elements (not affected by camera)
        this.renderUI();
    }

    private renderParticles() {
        this.ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--text-muted');
        for (const particle of this.particles) {
            this.ctx.globalAlpha = particle.opacity;
            this.ctx.beginPath();
            this.ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
            this.ctx.fill();
        }
        this.ctx.globalAlpha = 1;
    }

    private renderLinks() {
        for (const link of this.links) {
            const source = this.nodes.find(n => n.id === link.source);
            const target = this.nodes.find(n => n.id === link.target);
            
            if (source && target) {
                const thickness = this.plugin.settings.linkThickness[link.id] || 
                    link.thickness || this.plugin.settings.defaultLinkThickness;
                
                // Draw link with gradient
                const gradient = this.ctx.createLinearGradient(
                    source.x, source.y, target.x, target.y
                );
                
                if (link.similarity !== undefined) {
                    // Color based on similarity
                    const hue = link.similarity * 120; // 0 (red) to 120 (green)
                    gradient.addColorStop(0, `hsla(${hue}, 70%, 50%, 0.3)`);
                    gradient.addColorStop(1, `hsla(${hue}, 70%, 50%, 0.6)`);
                } else {
                    gradient.addColorStop(0, 'rgba(123, 136, 150, 0.2)');
                    gradient.addColorStop(1, 'rgba(123, 136, 150, 0.4)');
                }
                
                this.ctx.strokeStyle = gradient;
                this.ctx.lineWidth = thickness;
                this.ctx.beginPath();
                this.ctx.moveTo(source.x, source.y);
                this.ctx.lineTo(target.x, target.y);
                this.ctx.stroke();
            }
        }
    }

    private renderNodes() {
        const textColor = getComputedStyle(document.body).getPropertyValue('--text-normal');
        const accentColor = getComputedStyle(document.body).getPropertyValue('--interactive-accent');
        
        for (const node of this.nodes) {
            const isHovered = node === this.hoveredNode;
            const isSelected = node === this.selectedNode;
            const size = this.plugin.settings.nodeSize * (isHovered ? 1.2 : 1);
            
            // Draw node glow effect
            if (isHovered || isSelected) {
                const gradient = this.ctx.createRadialGradient(
                    node.x, node.y, 0,
                    node.x, node.y, size * 3
                );
                gradient.addColorStop(0, `${accentColor}40`);
                gradient.addColorStop(1, 'transparent');
                this.ctx.fillStyle = gradient;
                this.ctx.beginPath();
                this.ctx.arc(node.x, node.y, size * 3, 0, Math.PI * 2);
                this.ctx.fill();
            }
            
            // Draw node
            this.ctx.fillStyle = node.embedding ? accentColor : textColor;
            this.ctx.beginPath();
            this.ctx.arc(node.x, node.y, size, 0, Math.PI * 2);
            this.ctx.fill();
            
            // Draw node border
            this.ctx.strokeStyle = getComputedStyle(document.body).getPropertyValue('--background-primary');
            this.ctx.lineWidth = 2;
            this.ctx.stroke();
            
            // Draw label
            if (isHovered || isSelected || this.camera.zoom > 0.5) {
                this.ctx.fillStyle = textColor;
                this.ctx.font = `${12 / this.camera.zoom}px var(--font-interface)`;
                this.ctx.textAlign = 'center';
                this.ctx.textBaseline = 'top';
                this.ctx.fillText(node.name, node.x, node.y + size + 5);
            }
        }
    }

    private renderUI() {
        // Draw zoom level
        const uiColor = getComputedStyle(document.body).getPropertyValue('--text-muted');
        this.ctx.fillStyle = uiColor;
        this.ctx.font = '12px var(--font-interface)';
        this.ctx.textAlign = 'right';
        this.ctx.textBaseline = 'bottom';
        this.ctx.fillText(`Zoom: ${(this.camera.zoom * 100).toFixed(0)}%`, this.canvas.width - 10, this.canvas.height - 10);
    }

    resize(width: number, height: number) {
        this.canvas.width = width;
        this.canvas.height = height;
    }

    updateData(nodes: GraphNode[], links: GraphLink[]) {
        this.nodes = nodes;
        this.links = links;
        this.initializeLayout();
    }

    destroy() {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
        }
    }
}

interface Particle {
    x: number;
    y: number;
    vx: number;
    vy: number;
    size: number;
    opacity: number;
}