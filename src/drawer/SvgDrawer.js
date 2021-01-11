// we use the drawer to do all the preprocessing. then we take over the drawing
// portion to output to svg
const ArrayHelper = require('./ArrayHelper');
const Atom = require('./Atom');
const Drawer = require('./Drawer');
const Graph = require('./Graph');
const Line = require('./Line');
const SvgWrapper = require('./SvgWrapper');
const MathHelper = require('./MathHelper');
const ThemeManager = require('./ThemeManager');
const Vector2 = require('./Vector2');

class SvgDrawer {
    constructor(options) {
        // TODO aneb: properly handle config
        this.preprocessor = new Drawer(options);
        this.opts = this.preprocessor.opts
    }

    /**
     * Draws the parsed smiles data to an svg element.
     *
     * @param {Object} data The tree returned by the smiles parser.
     * @param {(String|HTMLElement)} target The id of the HTML svg element the structure is drawn to - or the element itself.
     * @param {String} themeName='dark' The name of the theme to use. Built-in themes are 'light' and 'dark'.
     * @param {Boolean} infoOnly=false Only output info on the molecule without drawing anything to the canvas.

     * @returns {Object} The dimensions of the drawing in { width, height }
     */
    draw(data, target, themeName = 'light', infoOnly = false) {
        let preprocessor = this.preprocessor;

        preprocessor.initDraw(data, themeName, infoOnly);

        if (!infoOnly) {
            this.themeManager = new ThemeManager(this.preprocessor.opts.themes, themeName);
            this.svgWrapper = new SvgWrapper(this.themeManager, target, this.preprocessor.opts);
        }

        preprocessor.processGraph();

        // Set the canvas to the appropriate size
        this.svgWrapper.determineDimensions(preprocessor.graph.vertices);

        // Do the actual drawing
        this.drawEdges();
        this.drawVertices();

        if (preprocessor.opts.debug) {
            console.log(preprocessor.graph);
            console.log(preprocessor.rings);
            console.log(preprocessor.ringConnections);
        }

        return this.svgWrapper.constructSvg();
    }

    /**
     * Draws a ring inside a provided ring, indicating aromaticity.
     * @param {Ring} ring A ring.
     */
    drawAromaticityRing(ring) {
        const r = MathHelper.apothemFromSideLength(this.opts.bondLength, ring.getSize());
        this.svgWrapper.drawRing(ring.center.x, ring.center.y, r * 0.8)
    }

    /**
     * Draw the actual edges as bonds.
     */
    drawEdges() {
        let preprocessor = this.preprocessor,
            graph = preprocessor.graph,
            rings = preprocessor.rings,
            drawn = Array(this.preprocessor.graph.edges.length);

        drawn.fill(false);

        graph.traverseBF(0, vertex => {
            let edges = graph.getEdges(vertex.id);
            for (let i = 0; i < edges.length; i++) {
                let edgeId = edges[i];
                if (!drawn[edgeId]) {
                    drawn[edgeId] = true;
                    this.drawEdge(edgeId);
                }
            }
        });

        // Draw ring for implicitly defined aromatic rings
        if (this.bridgedRing) {
            return;
        }
        // TODO aneb: think about how to add bonds to model when drawing ring!
        // ring methods have no id assignment yet
        for (let i = 0; i < rings.length; i++) {
            let ring = rings[i];
            if (preprocessor.isRingAromatic(ring)) {
                this.drawAromaticityRing(ring);
            }
        }
    }

    /**
     * Draw the an edge as a bond.
     * @param {Number} edgeId An edge id.
     */
    drawEdge(edgeId) {
        let preprocessor = this.preprocessor,
            opts = preprocessor.opts,
            svgWrapper = this.svgWrapper,
            edge = preprocessor.graph.edges[edgeId],
            vertexA = preprocessor.graph.vertices[edge.sourceId],
            vertexB = preprocessor.graph.vertices[edge.targetId],
            elementA = vertexA.value.element,
            elementB = vertexB.value.element;

        if ((!vertexA.value.isDrawn || !vertexB.value.isDrawn) && preprocessor.opts.atomVisualization === 'default') {
            return;
        }

        const edgeIdLabel = "edge-id"
        const edgeIdValue = `edge-${edgeId}`

        const wedgeIdLabel = "wedge-id"
        const wedgeIdValue = `wedge-${edgeId}`

        let a = vertexA.position,
            b = vertexB.position,
            normals = preprocessor.getEdgeNormals(edge),
            sides = ArrayHelper.clone(normals);

        sides[0].multiplyScalar(10).add(a);
        sides[1].multiplyScalar(10).add(a);

        if (edge.bondType === '=' || preprocessor.getRingbondType(vertexA, vertexB) === '=' ||
            (edge.isPartOfAromaticRing && preprocessor.bridgedRing)) {
            // Always draw double bonds inside the ring
            let inRing = preprocessor.areVerticesInSameRing(vertexA, vertexB);
            let s = preprocessor.chooseSide(vertexA, vertexB, sides);

            if (inRing) {
                // Always draw double bonds inside a ring
                // if the bond is shared by two rings, it is drawn in the larger
                // problem: smaller ring is aromatic, bond is still drawn in larger -> fix this
                let lcr = preprocessor.getLargestOrAromaticCommonRing(vertexA, vertexB);
                let center = lcr.center;

                normals[0].multiplyScalar(opts.bondSpacing);
                normals[1].multiplyScalar(opts.bondSpacing);

                // Choose the normal that is on the same side as the center
                let line;

                if (center.sameSideAs(vertexA.position, vertexB.position, Vector2.add(a, normals[0]))) {
                    line = new Line(Vector2.add(a, normals[0]), Vector2.add(b, normals[0]), elementA, elementB);
                } else {
                    line = new Line(Vector2.add(a, normals[1]), Vector2.add(b, normals[1]), elementA, elementB);
                }

                line.shorten(opts.bondLength - opts.shortBondLength * opts.bondLength);

                // The shortened edge
                svgWrapper.drawLine(edgeIdLabel, edgeIdValue, line, edge.isPartOfAromaticRing);
                svgWrapper.drawLine(edgeIdLabel, edgeIdValue, new Line(a, b, elementA, elementB));

            } else if ((edge.center || vertexA.isTerminal() && vertexB.isTerminal()) ||
                (s.anCount === 0 && s.bnCount > 1 || s.bnCount === 0 && s.anCount > 1)) {
                this.multiplyNormals(normals, opts.halfBondSpacing);

                let lineA = new Line(Vector2.add(a, normals[0]), Vector2.add(b, normals[0]), elementA, elementB),
                    lineB = new Line(Vector2.add(a, normals[1]), Vector2.add(b, normals[1]), elementA, elementB);

                svgWrapper.drawLine(edgeIdLabel, edgeIdValue, lineA);
                svgWrapper.drawLine(edgeIdLabel, edgeIdValue, lineB);
            } else if ((s.sideCount[0] > s.sideCount[1]) ||
                (s.totalSideCount[0] > s.totalSideCount[1])) {
                this.multiplyNormals(normals, opts.bondSpacing);

                let line = new Line(Vector2.add(a, normals[0]), Vector2.add(b, normals[0]), elementA, elementB);

                line.shorten(opts.bondLength - opts.shortBondLength * opts.bondLength);

                svgWrapper.drawLine(edgeIdLabel, edgeIdValue, line);
                svgWrapper.drawLine(edgeIdLabel, edgeIdValue, new Line(a, b, elementA, elementB));
            } else if ((s.sideCount[0] < s.sideCount[1]) ||
                (s.totalSideCount[0] <= s.totalSideCount[1])) {
                this.multiplyNormals(normals, opts.bondSpacing);

                let line = new Line(Vector2.add(a, normals[1]), Vector2.add(b, normals[1]), elementA, elementB);

                line.shorten(opts.bondLength - opts.shortBondLength * opts.bondLength);
                svgWrapper.drawLine(edgeIdLabel, edgeIdValue, line);
                svgWrapper.drawLine(edgeIdLabel, edgeIdValue, new Line(a, b, elementA, elementB));
            }
        } else if (edge.bondType === '#') {
            normals[0].multiplyScalar(opts.bondSpacing / 1.5);
            normals[1].multiplyScalar(opts.bondSpacing / 1.5);

            let lineA = new Line(Vector2.add(a, normals[0]), Vector2.add(b, normals[0]), elementA, elementB);
            let lineB = new Line(Vector2.add(a, normals[1]), Vector2.add(b, normals[1]), elementA, elementB);

            svgWrapper.drawLine(edgeIdLabel, edgeIdValue, lineA);
            svgWrapper.drawLine(edgeIdLabel, edgeIdValue, lineB);
            svgWrapper.drawLine(edgeIdLabel, edgeIdValue, new Line(a, b, elementA, elementB));
        } else if (edge.bondType === '.') {
            // TODO: Something... maybe... version 2?
        } else {
            let isChiralCenterA = vertexA.value.isStereoCenter;
            let isChiralCenterB = vertexB.value.isStereoCenter;

            if (edge.wedge === 'up') {
                svgWrapper.drawWedge(wedgeIdLabel, wedgeIdValue, new Line(a, b, elementA, elementB, isChiralCenterA, isChiralCenterB));
            } else if (edge.wedge === 'down') {
                svgWrapper.drawDashedWedge(wedgeIdLabel, wedgeIdValue, new Line(a, b, elementA, elementB, isChiralCenterA, isChiralCenterB));
            } else {
                svgWrapper.drawLine(edgeIdLabel, edgeIdValue, new Line(a, b, elementA, elementB, isChiralCenterA, isChiralCenterB));
            }
        }
    }

    /**
     * Draws the vertices representing atoms to the canvas.
     *
     */
    drawVertices() {
        let preprocessor = this.preprocessor,
            opts = preprocessor.opts,
            graph = preprocessor.graph,
            svgWrapper = this.svgWrapper;

        const vertexIdLabel = "vertex-id"


        for (let i = 0; i < graph.vertices.length; i++) {
            let vertex = graph.vertices[i];
            let atom = vertex.value;
            let charge = 0;
            let isotope = 0;
            let bondCount = vertex.value.bondCount;
            let element = atom.element;
            let hydrogens = Atom.maxBonds[element] - bondCount;
            let dir = vertex.getTextDirection(graph.vertices);
            let isTerminal = opts.terminalCarbons || element !== 'C' || atom.hasAttachedPseudoElements ? vertex.isTerminal() : false;
            let isCarbon = atom.element === 'C';

            const vertexIdValue = `vertex-id-${i}`

            // This is a HACK to remove all hydrogens from nitrogens in aromatic rings, as this
            // should be the most common state. This has to be fixed by kekulization
            if (atom.element === 'N' && atom.isPartOfAromaticRing) {
                hydrogens = 0;
            }

            if (atom.bracket) {
                hydrogens = atom.bracket.hcount;
                charge = atom.bracket.charge;
                isotope = atom.bracket.isotope;
            }

            if (opts.atomVisualization === 'allballs') {
                svgWrapper.drawBall(vertexIdLabel, vertexIdValue, vertex.position.x, vertex.position.y, element);
            } else if ((atom.isDrawn && (!isCarbon || atom.drawExplicit || isTerminal || atom.hasAttachedPseudoElements)) || graph.vertices.length === 1) {
                if (opts.atomVisualization === 'default') {
                    svgWrapper.drawText(vertexIdLabel, vertexIdValue, vertex.position.x, vertex.position.y,
                        element, hydrogens, dir, isTerminal, charge, isotope, atom.getAttachedPseudoElements());
                } else if (opts.atomVisualization === 'balls') {
                    svgWrapper.drawBall(vertexIdLabel, vertexIdValue, vertex.position.x, vertex.position.y, element);
                }
            } else if (vertex.getNeighbourCount() === 2 && vertex.forcePositioned === true) {
                // If there is a carbon which bonds are in a straight line, draw a dot
                let a = graph.vertices[vertex.neighbours[0]].position;
                let b = graph.vertices[vertex.neighbours[1]].position;
                let angle = Vector2.threePointangle(vertex.position, a, b);

                if (Math.abs(Math.PI - angle) < 0.1) {
                    svgWrapper.drawPoint(vertexIdLabel, vertexIdValue, vertex.position.x, vertex.position.y, element);
                }
            }
        }
    }

    /**
     * Returns the total overlap score of the current molecule.
     * @returns {Number} The overlap score.
     */
    getTotalOverlapScore() {
        return this.preprocessor.getTotalOverlapScore();
    }

    /**
     * Returns the molecular formula of the loaded molecule as a string.
     * @returns {String} The molecular formula.
     */
    getMolecularFormula() {
        return this.preprocessor.getMolecularFormula();
    }

    /**
     * @param {Array} normals list of normals to multiply
     * @param {Number} spacing value to multiply normals by
     */
    multiplyNormals(normals, spacing) {
        normals[0].multiplyScalar(spacing);
        normals[1].multiplyScalar(spacing);
    }
}

module.exports = SvgDrawer;