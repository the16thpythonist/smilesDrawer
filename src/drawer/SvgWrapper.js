const {
    getChargeText
} = require('./UtilityFunctions');

const Line = require('./Line');
const Vector2 = require('./Vector2');

const jsdom = require("jsdom");
const SVG = require("../generator/SVG");
const {JSDOM} = jsdom;
const {document} = (new JSDOM(``)).window;

class SvgWrapper {
    constructor(themeManager, target, options) {
        // TODO change naming everywhere and give this a proper name
        this.svgHelper = new SVG()

        this.svg = target;
        this.opts = options;
        this.gradientId = 0;

        // maintain a list of line elements and their corresponding gradients
        // maintain a list of vertex elements
        this.paths = [];
        this.vertices = [];
        this.gradients = [];

        // maintain the offset for drawing purposes
        this.offsetX = 0.0;
        this.offsetY = 0.0;

        // maintain the dimensions
        this.drawingWidth = 0;
        this.drawingHeight = 0;
        this.halfBondThickness = this.opts.bondThickness / 2.0;

        // for managing color schemes
        this.themeManager = themeManager;

        // create the mask
        this.maskElements = [];

        const mask = this.svgHelper.createElement('rect', {
            x: 0, y: 0,
            width: '100%', height: '100%',
            fill: 'white',
        })

        this.maskElements.push(mask);
    }

    constructSvg() {
        const pathChildNodes = this.paths;
        const [defs, style, vertices] = ['defs', 'style', 'g'].map(el => this.svgHelper.createElement(el))
        const masks = this.svgHelper.createElement("mask", {id: "text-mask"})
        const paths = this.svgHelper.createElement("g", {mask: 'url(#text-mask)'})

        style.appendChild(document.createTextNode(`
                .element {
                    font: ${this.opts.fontSizeLarge}pt Helvetica, Arial, sans-serif;
                    alignment-baseline: 'middle';
                }
                .sub {
                    font: ${this.opts.fontSizeSmall}pt Helvetica, Arial, sans-serif;
                }
            `));

        this.svgHelper.appendChildren(paths, pathChildNodes)
        this.svgHelper.appendChildren(vertices, this.vertices)
        this.svgHelper.appendChildren(masks, this.maskElements)
        this.svgHelper.appendChildren(defs, this.gradients)

        this.svgHelper.appendChildren(this.svg, [defs, masks, style, paths, vertices])

        return this.svg;
    }

    /**
     * Create a linear gradient to apply to a line
     * @param {Line} line the line to apply the gradiation to.
     */
    createGradient(line) {
        const gradientUrl = `line-${this.gradientId++}`
        const l = line.getLeftVector()
        const r = line.getRightVector()
        const fromX = l.x + this.offsetX
        const fromY = l.y + this.offsetY
        const toX = r.x + this.offsetX
        const toY = r.y + this.offsetY

        const firstStopColor = this.themeManager.getColor(line.getLeftElement()) || this.themeManager.getColor('C')
        const firstStop = this.svgHelper.createElement('stop', {'stop-color': firstStopColor, offset: '20%'})

        const secondStopColor = this.themeManager.getColor(line.getRightElement() || this.themeManager.getColor('C'))
        const secondStop = this.svgHelper.createElement('stop', {'stop-color': secondStopColor, offset: '100%'})

        const gradientAttributes = {id: gradientUrl, gradientUnits: 'userSpaceOnUse', x1: fromX, y1: fromY, x2: toX, y2: toY,}
        const gradient = this.svgHelper.createElement('linearGradient', gradientAttributes, [firstStop, secondStop])

        this.gradients.push(gradient);

        return gradientUrl;
    }

    /**
     * Create a tspan element for sub or super scripts that styles the text
     * appropriately as one of those text types.
     * @param {String} text the actual text
     * @param {String} shift the type of text, either 'sub', or 'super'
     */
    createSubSuperScripts(text, shift) {
        const attributes = {'baseline-shift': shift, class: 'sub'}
        const textNode = document.createTextNode(text)
        return this.svgHelper.createElement('tspan', attributes, [textNode])
    }

    /**
     * Determine drawing dimensiosn based on vertex positions.
     * @param {Vertex[]} vertices An array of vertices containing the vertices associated with the current molecule.
     */
    determineDimensions(vertices) {
        // Figure out the final size of the image
        let maxX = -Number.MAX_VALUE;
        let maxY = -Number.MAX_VALUE;
        let minX = Number.MAX_VALUE;
        let minY = Number.MAX_VALUE;

        for (let i = 0; i < vertices.length; i++) {
            if (!vertices[i].value.isDrawn) {
                continue;
            }

            let p = vertices[i].position;

            if (maxX < p.x) maxX = p.x;
            if (maxY < p.y) maxY = p.y;
            if (minX > p.x) minX = p.x;
            if (minY > p.y) minY = p.y;
        }

        maxX += this.opts.padding
        maxY += this.opts.padding
        minX -= this.opts.padding
        minY -= this.opts.padding

        this.drawingWidth = Math.ceil(maxX - minX);
        this.drawingHeight = Math.ceil(maxY - minY);

        this.offsetX = -minX;
        this.offsetY = -minY;

        this.svgHelper.update(this.svg, {
            width: this.drawingWidth + 5,
            height: this.drawingHeight + 5,
            viewBox: `0 0 ${this.drawingWidth} ${this.drawingHeight}`
        })
    }

    /**
     * Draw an svg ellipse as a ball.
     * @param vertexIdLabel
     * @param vertexIdValue
     * @param {Number} x The x position of the text.
     * @param {Number} y The y position of the text.
     * @param {String} elementName The name of the element (single-letter).
     */
    drawBall(vertexIdLabel, vertexIdValue, x, y, elementName) {
        const ball = this.svgHelper.createElement('circle', {
            [vertexIdLabel]: vertexIdValue,
            cx: x + this.offsetX,
            cy: y + this.offsetY,
            r: this.opts.bondLength / 4.5,
            fill: this.themeManager.getColor(elementName)
        })

        this.vertices.push(ball);
    }

    /**
     * Draw an svg ring.
     * @param {Number} x The x position of the text.
     * @param {Number} y The y position of the text.
     * @param {Number} r Radius of ring
     */
    drawRing(x, y, r) {
        const ring = this.svgHelper.createElement('circle', {
            cx: x + this.offsetX,
            cy: y + this.offsetY,
            r: r,
            fill: 'none',
            stroke: this.themeManager.getColor("C")
        })

        this.vertices.push(ring);
    }

    /**
     * Draw a dashed wedge on the canvas.
     * @param idLabel
     * @param idValue
     * @param {Line} line A line.
     */
    drawDashedWedge(idLabel, idValue, line) {
        if (isNaN(line.from.x) || isNaN(line.from.y) ||
            isNaN(line.to.x) || isNaN(line.to.y)) {
            return;
        }

        const l = line.getLeftVector().clone()
        const r = line.getRightVector().clone()
        const normals = Vector2.normals(l, r)

        normals[0].normalize();
        normals[1].normalize();

        const isRightChiralCenter = line.getRightChiral()
        const [start, end] = isRightChiralCenter ? [r, l] : [l, r]

        const dir = Vector2.subtract(end, start).normalize()
        const length = line.getLength()
        const step = 1.25 / (length / (this.opts.bondThickness * 3.0))

        const gradient = this.createGradient(line);

        for (let t = 0.0; t < 1.0; t += step) {
            const to = Vector2.multiplyScalar(dir, t * length)
            const startDash = Vector2.add(start, to)
            const width = 1.5 * t
            const dashOffset = Vector2.multiplyScalar(normals[0], width)

            startDash.subtract(dashOffset);
            const endDash = startDash.clone();
            endDash.add(Vector2.multiplyScalar(dashOffset, 2.0));

            this.drawLine(idLabel, idValue, new Line(startDash, endDash), null, gradient);
        }
    }

    /**
     * Draws a line.
     * @param idLabel
     * @param idValue
     * @param {Line} line A line.
     * @param {Boolean} dashed defaults to false.
     * @param {String} gradient gradient url. Defaults to null.
     */
    drawLine(idLabel, idValue, line, dashed = false, gradient = null) {
        let stylesArr = [
                ['stroke-linecap', 'round'],
                ['stroke-dasharray', dashed ? '5, 5' : 'none'],
            ],
            l = line.getLeftVector(),
            r = line.getRightVector(),
            fromX = l.x + this.offsetX,
            fromY = l.y + this.offsetY,
            toX = r.x + this.offsetX,
            toY = r.y + this.offsetY;

        let styles = stylesArr.map(sub => sub.join(':')).join(';'),
            lineElem = document.createElementNS('http://www.w3.org/2000/svg', 'line');

        gradient = gradient || this.createGradient(line);

        lineElem.setAttributeNS(null, idLabel, idValue);
        lineElem.setAttributeNS(null, 'x1', fromX);
        lineElem.setAttributeNS(null, 'y1', fromY);
        lineElem.setAttributeNS(null, 'x2', toX);
        lineElem.setAttributeNS(null, 'y2', toY);
        lineElem.setAttributeNS(null, 'style', styles);
        lineElem.setAttributeNS(null, 'stroke', `url('#${gradient}')`);

        this.paths.push(lineElem);
    }

    /**
     * Draw a point.
     * @param vertexIdLabel
     * @param vertexIdValue
     * @param {Number} x The x position of the point.
     * @param {Number} y The y position of the point.
     * @param {String} elementName The name of the element (single-letter).
     */
    drawPoint(vertexIdLabel, vertexIdValue, x, y, elementName) {
        let offsetX = this.offsetX;
        let offsetY = this.offsetY;

        // first create a mask
        let mask = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        mask.setAttributeNS(null, `mask-${vertexIdLabel}`, vertexIdValue);
        mask.setAttributeNS(null, 'cx', x + offsetX);
        mask.setAttributeNS(null, 'cy', y + offsetY);
        mask.setAttributeNS(null, 'r', '1.5');
        mask.setAttributeNS(null, 'fill', 'black');
        this.maskElements.push(mask);

        // now create the point
        let point = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        mask.setAttributeNS(null, `point-${vertexIdLabel}`, vertexIdValue);
        point.setAttributeNS(null, 'cx', x + offsetX);
        point.setAttributeNS(null, 'cy', y + offsetY);
        point.setAttributeNS(null, 'r', '0.75');
        point.setAttributeNS(null, 'fill', this.themeManager.getColor(elementName));
        this.vertices.push(point);
    }

    /**
     * Draw a text to the canvas.
     * @param vertexIdLabel
     * @param vertexIdValue
     * @param {Number} x The x position of the text.
     * @param {Number} y The y position of the text.
     * @param {String} elementName The name of the element (single-letter).
     * @param {Number} hydrogens The number of hydrogen atoms.
     * @param {String} direction The direction of the text in relation to the associated vertex.
     * @param {Boolean} isTerminal A boolean indicating whether or not the vertex is terminal.
     * @param {Number} charge The charge of the atom.
     * @param {Number} isotope The isotope number.
     * @param {Object} attachedPseudoElement A map with containing information for pseudo elements or concatinated elements. The key is comprised of the element symbol and the hydrogen count.
     * @param {String} attachedPseudoElement.element The element symbol.
     * @param {Number} attachedPseudoElement.count The number of occurences that match the key.
     * @param {Number} attachedPseudoElement.hyrogenCount The number of hydrogens attached to each atom matching the key.
     */
    drawText(vertexIdLabel, vertexIdValue, x, y, elementName, hydrogens, direction, isTerminal, charge, isotope, attachedPseudoElement = {}) {
        let offsetX = this.offsetX,
            offsetY = this.offsetY,
            pos = {
                x: x + offsetX,
                y: y + offsetY,
            },
            textElem = document.createElementNS('http://www.w3.org/2000/svg', 'text'),
            writingMode = 'horizontal-tb',
            letterSpacing = 'normal',
            textOrientation = 'mixed',
            textDirection = 'direction: ltr;',
            xShift = -2,
            yShift = 2.5;

        let mask = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        mask.setAttributeNS(null, `text-mask-${vertexIdLabel}`, vertexIdValue);
        mask.setAttributeNS(null, 'cx', pos.x);
        mask.setAttributeNS(null, 'cy', pos.y);
        mask.setAttributeNS(null, 'r', '3.5');
        mask.setAttributeNS(null, 'fill', 'black');
        this.maskElements.push(mask);

        // determine writing mode
        if (/up|down/.test(direction) && !isTerminal) {
            writingMode = 'vertical-rl';
            textOrientation = 'upright';
            letterSpacing = '-1px';
        }

        if (direction === 'down' && !isTerminal) {
            xShift = 0;
            yShift = -2;
        } else if (direction === 'up' && !isTerminal) {
            xShift = 0.5;
        } else if (direction === 'left') {
            xShift = 2;
        }

        if (direction === 'left' || (direction === 'up' && !isTerminal)) {
            textDirection = 'direction: rtl; unicode-bidi: bidi-override;'
        }

        // now the text element
        // TODO aneb: make naming consistent, this is the actual label, so it gets the passed idLabel
        textElem.setAttributeNS(null, `${vertexIdLabel}`, vertexIdValue);
        textElem.setAttributeNS(null, 'x', pos.x + xShift);
        textElem.setAttributeNS(null, 'y', pos.y + yShift);
        textElem.setAttributeNS(null, 'class', 'element');
        textElem.setAttributeNS(null, 'fill', this.themeManager.getColor(elementName));
        textElem.setAttributeNS(null, 'style', `text-anchor: start;writing-mode: ${writingMode};text-orientation: ${textOrientation};letter-spacing: ${letterSpacing};${textDirection}
            `);

        let textNode = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
        // special case for element names that are 2 letters
        if (elementName.length > 1) {
            let textAnchor = /up|down/.test(direction) ? 'middle' : 'start';
            textNode.setAttributeNS(null, `text-node-${vertexIdLabel}`, vertexIdValue);
            textNode.setAttributeNS(null, 'style', `unicode-bidi: plaintext;writing-mode: lr-tb;letter-spacing: normal;text-anchor: ${textAnchor};`);
        }
        textNode.appendChild(document.createTextNode(elementName));
        textElem.appendChild(textNode);

        // Charge
        if (charge) {
            let chargeElem = this.createSubSuperScripts(getChargeText(charge), 'super');
            textNode.appendChild(chargeElem);
        }

        if (isotope > 0) {
            let isotopeElem = this.createSubSuperScripts(isotope.toString(), 'super');
            textNode.appendChild(isotopeElem);
        }

        // TODO: Better handle exceptions
        // Exception for nitro (draw nitro as NO2 instead of N+O-O)
        if (charge === 1 && elementName === 'N' && attachedPseudoElement.hasOwnProperty('0O') &&
            attachedPseudoElement.hasOwnProperty('0O-1')) {
            attachedPseudoElement = {
                '0O': {
                    element: 'O',
                    count: 2,
                    hydrogenCount: 0,
                    previousElement: 'C',
                    charge: ''
                }
            }
        }
        // TODO aneb: should be ok not to set ids here since text element has id
        if (hydrogens > 0) {
            let hydrogenElem = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
            hydrogenElem.setAttributeNS(null, 'style', 'unicode-bidi: plaintext;');
            hydrogenElem.appendChild(document.createTextNode('H'));
            textElem.appendChild(hydrogenElem);

            if (hydrogens > 1) {
                let hydrogenCountElem = this.createSubSuperScripts(hydrogens, 'sub');
                hydrogenElem.appendChild(hydrogenCountElem);
            }
        }

        for (let key in attachedPseudoElement) {
            if (!attachedPseudoElement.hasOwnProperty(key)) {
                continue;
            }

            let element = attachedPseudoElement[key].element,
                elementCount = attachedPseudoElement[key].count,
                hydrogenCount = attachedPseudoElement[key].hydrogenCount,
                elementCharge = attachedPseudoElement[key].charge,
                pseudoElementElem = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');

            pseudoElementElem.setAttributeNS(null, 'style', 'unicode-bidi: plaintext;');
            pseudoElementElem.appendChild(document.createTextNode(element));
            pseudoElementElem.setAttributeNS(null, 'fill', this.themeManager.getColor(element));

            if (elementCharge !== 0) {
                let elementChargeElem = this.createSubSuperScripts(getChargeText(elementCharge), 'super');
                pseudoElementElem.appendChild(elementChargeElem);
            }

            if (hydrogenCount > 0) {
                let pseudoHydrogenElem = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');

                pseudoHydrogenElem.setAttributeNS(null, 'style', 'unicode-bidi: plaintext;');
                pseudoHydrogenElem.appendChild(document.createTextNode('H'));
                pseudoElementElem.appendChild(pseudoHydrogenElem);

                if (hydrogenCount > 1) {
                    let hydrogenCountElem = this.createSubSuperScripts(hydrogenCount, 'sub');
                    pseudoHydrogenElem.appendChild(hydrogenCountElem);
                }
            }

            if (elementCount > 1) {
                let elementCountElem = this.createSubSuperScripts(elementCount, 'sub');
                pseudoElementElem.appendChild(elementCountElem);
            }

            textElem.appendChild(pseudoElementElem);
        }

        this.vertices.push(textElem);
    }

    /**
     * @param idLabel
     * @param idValue
     * @param {Line} line the line object to create the wedge from
     */
    drawWedge(idLabel, idValue, line) {
        let offsetX = this.offsetX,
            offsetY = this.offsetY,
            l = line.getLeftVector().clone(),
            r = line.getRightVector().clone();

        l.x += offsetX;
        l.y += offsetY;

        r.x += offsetX;
        r.y += offsetY;

        let normals = Vector2.normals(l, r);

        normals[0].normalize();
        normals[1].normalize();

        let isRightChiralCenter = line.getRightChiral();

        let start = l,
            end = r;

        if (isRightChiralCenter) {
            start = r;
            end = l;
        }

        let t = Vector2.add(start, Vector2.multiplyScalar(normals[0], this.halfBondThickness)),
            u = Vector2.add(end, Vector2.multiplyScalar(normals[0], 1.5 + this.halfBondThickness)),
            v = Vector2.add(end, Vector2.multiplyScalar(normals[1], 1.5 + this.halfBondThickness)),
            w = Vector2.add(start, Vector2.multiplyScalar(normals[1], this.halfBondThickness));

        let polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon')
        let gradient = this.createGradient(line);

        polygon.setAttributeNS(null, idLabel, idValue);
        polygon.setAttributeNS(null, 'points', `${t.x},${t.y} ${u.x},${u.y} ${v.x},${v.y} ${w.x},${w.y}`);
        polygon.setAttributeNS(null, 'fill', `url('#${gradient}')`);
        this.paths.push(polygon);
    }
}

module.exports = SvgWrapper;