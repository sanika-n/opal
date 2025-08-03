import * as d3 from 'd3';
import { TFile } from 'obsidian';
import type BetterGraphPlugin from './main';
import type { BetterGraphView } from './GraphView';
import { GraphNode, GraphLink } from './types';

export class GraphRenderer {
    private container: HTMLElement;
    private plugin: BetterGraphPlugin;
    private view: BetterGraphView;
    private svg: d3.Selection<SVGSVGElement, unknown, null, undefined>;
    private g: d3.Selection<SVGGElement, unknown, null, undefined>;
    private simulation: d3.Simulation<GraphNode, GraphLink>;
    private nodes: GraphNode[] = [];
    private links: GraphLink[] = [];
    private linkElements: d3.Selection<SVGLineElement, GraphLink, SVGGElement, unknown>;
    private nodeElements: d3.Selection<SVGGElement, GraphNode, SVGGElement, unknown>;
    private zoom: d3.ZoomBehavior<SVGSVGElement, unknown>;
    private isAnimating: boolean = true;

    constructor(container: HTMLElement, plugin: BetterGraphPlugin, view: BetterGraphView) {
        this.container = container;
        this.plugin = plugin;
        this.view = view;
    }

    initialize(nodes: GraphNode[], links: GraphLink[]) {
        this.nodes = nodes;
        this.links = links;
        this.setupSVG();
        this.setupSimulation();
        this.render();
    }

    private setupSVG() {
        // Clear any existing SVG
        d3.select(this.container).selectAll('*').remove();
        
        const width = this.container.clientWidth || 800;
        const height = this.container.clientHeight || 600;

        // Create SVG
        this.svg = d3.select(this.container)
            .append('svg')
            .attr('width', '100%')
            .attr('height', '100%')
            .attr('viewBox', `0 0 ${width} ${height}`)
            .style('background', 'var(--background-primary)');

        // Add zoom behavior
        this.zoom = d3.zoom<SVGSVGElement, unknown>()
            .scaleExtent([0.1, 4])
            .on('zoom', (event) => {
                this.g.attr('transform', event.transform);
            });

        this.svg.call(this.zoom);

        // Create main group
        this.g = this.svg.append('g');

        // Add arrow markers
        this.svg.append('defs').selectAll('marker')
            .data(['arrow'])
            .join('marker')
            .attr('id', 'arrow')
            .attr('viewBox', '0 -5 10 10')
            .attr('refX', 20)
            .attr('refY', 0)
            .attr('markerWidth', 6)
            .attr('markerHeight', 6)
            .attr('orient', 'auto')
            .append('path')
            .attr('fill', 'var(--text-muted)')
            .attr('d', 'M0,-5L10,0L0,5');
    
    }

    private setupSimulation() {
        const width = this.container.clientWidth || 800;
        const height = this.container.clientHeight || 600;

        // Initialize node positions
        this.nodes.forEach((node, i) => {
            node.x = Math.random() * width;
            node.y = Math.random() * height;
        });

        this.simulation = d3.forceSimulation<GraphNode>(this.nodes)
            .force('link', d3.forceLink<GraphNode, GraphLink>(this.links)
                .id(d => d.id)
                .distance(this.plugin.settings.linkDistance))
            .force('charge', d3.forceManyBody()
                .strength(-this.plugin.settings.repulsionForce))
            .force('center', d3.forceCenter(width / 2, height / 2)
                .strength(this.plugin.settings.centerForce))
            .force('collision', d3.forceCollide()
                .radius(this.plugin.settings.nodeSize + 10));

        this.simulation.on('tick', () => this.ticked());
    }

    private render() {
        // Render links
        this.linkElements = this.g.append('g')
            .attr('class', 'links')
            .selectAll<SVGLineElement, GraphLink>('line')
            .data(this.links)
            .join('line')
            .attr('stroke', d => {
                if (d.similarity !== undefined) {
                    const hue = d.similarity * 120;
                    return `hsl(${hue}, 50%, 50%)`;
                }
                return 'var(--text-muted)';
            })
            .attr('stroke-opacity', 0.6)
            .attr('stroke-width', d => d.thickness || this.plugin.settings.defaultLinkThickness);

        // Render nodes
        const node = this.g.append('g')
            .attr('class', 'nodes')
            .selectAll<SVGGElement, GraphNode>('g')
            .data(this.nodes)
            .join('g')
            .attr('class', 'node')
            .call(this.drag() as any);

        // Add circles
        node.append('circle')
            .attr('r', this.plugin.settings.nodeSize)
            .attr('fill', d => d.embedding ? 'var(--interactive-accent)' : 'var(--text-accent)')
            .attr('stroke', 'var(--background-primary)')
            .attr('stroke-width', 2);

        // Add labels
        node.append('text')
            .text(d => d.name)
            .attr('x', 0)
            .attr('y', -this.plugin.settings.nodeSize - 5)
            .attr('text-anchor', 'middle')
            .attr('font-size', '12px')
            .attr('fill', 'var(--text-normal)')
            .attr('class', 'node-label');

        // Add hover effects
        node.on('mouseenter', (event, d) => {
            d3.select(event.currentTarget).select('circle')
                .transition()
                .duration(200)
                .attr('r', this.plugin.settings.nodeSize * 1.2);
        })
        .on('mouseleave', (event, d) => {
            d3.select(event.currentTarget).select('circle')
                .transition()
                .duration(200)
                .attr('r', this.plugin.settings.nodeSize);
        });

        // Handle clicks
        node.on('click', async (event, d) => {
            event.stopPropagation();
            const file = this.plugin.app.vault.getAbstractFileByPath(d.path);
            if (file instanceof TFile) {
                await this.plugin.app.workspace.getLeaf().openFile(file);
            }
        });

        this.nodeElements = node;
    }

    private drag() {
        return d3.drag<SVGGElement, GraphNode>()
            .on('start', (event, d) => {
                if (!event.active) this.simulation.alphaTarget(0.3).restart();
                d.vx = d.x;
                d.vy = d.y;
            })
            .on('drag', (event, d) => {
                d.vx = event.x;
                d.vy = event.y;
            })
            .on('end', (event, d) => {
                if (!event.active) this.simulation.alphaTarget(0);
                d.vx = 0;
                d.vy = 0;
            });
    }

    private ticked() {
        if (this.linkElements) {
            this.linkElements
                .attr('x1', d => (d.source as any).x!)
                .attr('y1', d => (d.source as any).y!)
                .attr('x2', d => (d.target as any).x!)
                .attr('y2', d => (d.target as any).y!);
        }

        if (this.nodeElements) {
            this.nodeElements
                .attr('transform', d => `translate(${d.x},${d.y})`);
        }
    }

    // Add these methods to GraphRenderer class:

    applyNodeVisibility() {
        // Update node visibility
        this.nodeElements
            .style('display', d => d.hidden ? 'none' : 'block');
        
        // Update link visibility
        this.linkElements
            .style('display', d => {
                const source = typeof d.source === 'string' ? d.source : (d.source as GraphNode).id;
                const target = typeof d.target === 'string' ? d.target : (d.target as GraphNode).id;
                const sourceNode = this.nodes.find(n => n.id === source);
                const targetNode = this.nodes.find(n => n.id === target);
                return (sourceNode?.hidden || targetNode?.hidden) ? 'none' : 'block';
            });
    }

    toggleArrows(showArrows: boolean) {
        this.linkElements
            .attr('marker-end', showArrows ? 'url(#arrow)' : null);
    }

    setTextFadeThreshold(threshold: number) {
        // Implement text fading based on zoom level
        const svgNode = this.svg.node();
        if (!svgNode) return;
        const currentZoom = d3.zoomTransform(svgNode).k;
        this.nodeElements.selectAll('text')
            .style('opacity', currentZoom < threshold ? 0 : 1);
    }

    updateNodeSize(size: number) {
        this.nodeElements.selectAll('circle')
            .attr('r', size);
    }

    updateLinkThickness(thickness: number) {
        this.linkElements
            .attr('stroke-width', d => d.thickness || thickness);
    }

    updateLinkForce(strength: number) {
        this.simulation.force('link', d3.forceLink<GraphNode, GraphLink>(this.links)
            .id(d => d.id)
            .distance(this.plugin.settings.linkDistance)
            .strength(strength));
        this.simulation.alpha(0.3).restart();
    }

    updateForces() {
        const width = this.container.clientWidth || 800;
        const height = this.container.clientHeight || 600;
        
        this.simulation
            .force('charge', d3.forceManyBody()
                .strength(-this.plugin.settings.repulsionForce))
            .force('center', d3.forceCenter(width / 2, height / 2)
                .strength(this.plugin.settings.centerForce))
            .force('link', d3.forceLink<GraphNode, GraphLink>(this.links)
                .id(d => d.id)
                .distance(this.plugin.settings.linkDistance));
        
        this.simulation.alpha(0.3).restart();
    }

    toggleAnimation(animate: boolean) {
        this.isAnimating = animate;
        if (animate) {
            this.simulation.restart();
        } else {
            this.simulation.stop();
        }
    }

    updateData(nodes: GraphNode[], links: GraphLink[]) {
        this.nodes = nodes;
        this.links = links;
        
        // Clear and re-render
        this.g.selectAll('*').remove();
        this.setupSimulation();
        this.render();
    }

    resize() {
        const width = this.container.clientWidth || 800;
        const height = this.container.clientHeight || 600;
        
        if (this.svg) {
            this.svg.attr('viewBox', `0 0 ${width} ${height}`);
        }
        
        if (this.simulation) {
            this.simulation.force('center', d3.forceCenter(width / 2, height / 2));
            this.simulation.alpha(0.3).restart();
        }
    }

    destroy() {
        if (this.simulation) {
            this.simulation.stop();
        }
        if (this.svg) {
            this.svg.remove();
        }
    }
}