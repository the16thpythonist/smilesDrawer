const Line = require('./Line')
const Vector2 = require('./Vector2')

const jsdom = require('jsdom')
const SVG = require('../generator/SVG')
const { JSDOM } = jsdom
const { document } = (new JSDOM('')).window

class SvgWrapper {
  constructor(target, options, colors) {
    this.svgHelper = new SVG()

    this.svg = target
    this.opts = options
    this.colors = colors
    this.gradientId = 0

    // maintain a list of line elements and their corresponding gradients
    // maintain a list of vertex elements
    this.paths = []
    this.vertices = []
    this.gradients = []

    // maintain the offset for drawing purposes
    this.offsetX = 0.0
    this.offsetY = 0.0

    // maintain the dimensions
    this.drawingWidth = 0
    this.drawingHeight = 0
    this.halfBondThickness = this.opts.bondThickness / 2.0

    // create the mask
    this.maskElements = []

    const mask = this.svgHelper.createElement('rect', {
      x: 0,
      y: 0,
      width: '100%',
      height: '100%',
      fill: 'white'
    })

    this.maskElements.push(mask)
  }

  getColor(element) {
    return this.colors[element] || this.colors.C
  }

  getChargeText(charge) {
    const charges = {
      1: '+',
      2: '2+',
      '-1': '-',
      '-2': '2-'
    }
    return charges[charge] || ''
  }

  constructSvg() {
    const pathChildNodes = this.paths
    const [defs, style, vertices] = ['defs', 'style', 'g'].map(el => this.svgHelper.createElement(el))
    const masks = this.svgHelper.createElement('mask', { id: 'text-mask' })
    const paths = this.svgHelper.createElement('g', { mask: 'url(#text-mask)' })

    const fontUrl = encodeURI(`https://fonts.googleapis.com/css?family=${encodeURIComponent(this.opts.font)}`)

    style.appendChild(document.createTextNode(`
    @import url('${fontUrl}');
    body {
      font-family: '${this.opts.font}', sans-serif;
    }
    `))

    style.appendChild(document.createTextNode(`
    .element {
        font: ${this.opts.fontSizeLarge}pt ${this.opts.font};
        font-weight: ${this.opts.fontWeight};
        alignment-baseline: 'middle';
    }
    .sub {
        font: ${this.opts.fontSizeSmall}pt ${this.opts.font};
        font-weight: ${this.opts.fontWeight};
    }
    `))

    this.svgHelper.appendChildren(paths, pathChildNodes)
    this.svgHelper.appendChildren(vertices, this.vertices)
    this.svgHelper.appendChildren(masks, this.maskElements)
    this.svgHelper.appendChildren(defs, this.gradients)

    this.svgHelper.appendChildren(this.svg, [defs, masks, style, paths, vertices])

    return this.svg
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

    const firstStopColor = this.getColor(line.getLeftElement())
    const firstStop = this.svgHelper.createElement('stop', {
      'stop-color': firstStopColor,
      offset: `${this.opts.gradientOffset}%`
    })

    const secondStopColor = this.getColor(line.getRightElement())
    const secondStop = this.svgHelper.createElement('stop', {
      'stop-color': secondStopColor,
      offset: '0%'
    })

    const gradientAttributes = {
      id: gradientUrl,
      gradientUnits: 'userSpaceOnUse',
      x1: fromX,
      y1: fromY,
      x2: toX,
      y2: toY
    }
    const gradient = this.svgHelper.createElement('linearGradient', gradientAttributes, [firstStop, secondStop])

    this.gradients.push(gradient)

    return gradientUrl
  }

  /**
   * Create a tspan element for sub or super scripts that styles the text
   * appropriately as one of those text types.
   * @param {String} text the actual text
   * @param {String} shift the type of text, either 'sub', or 'super'
   * @param color
   */
  createSubSuperScripts(text, shift, color = null) {
    const attributes = {
      'baseline-shift': shift,
      class: 'sub',
      color: color
    }
    const textNode = document.createTextNode(text)
    return this.svgHelper.createElement('tspan', attributes, [textNode])
  }

  /**
   * Determine drawing dimensiosn based on vertex positions.
   * @param {Vertex[]} vertices An array of vertices containing the vertices associated with the current molecule.
   */
  determineDimensions(vertices) {
    // Figure out the final size of the image
    let maxX = -Number.MAX_VALUE
    let maxY = -Number.MAX_VALUE
    let minX = Number.MAX_VALUE
    let minY = Number.MAX_VALUE

    for (let i = 0; i < vertices.length; i++) {
      if (!vertices[i].value.isDrawn) {
        continue
      }

      const p = vertices[i].position

      if (maxX < p.x) maxX = p.x
      if (maxY < p.y) maxY = p.y
      if (minX > p.x) minX = p.x
      if (minY > p.y) minY = p.y
    }

    maxX += this.opts.padding
    maxY += this.opts.padding
    minX -= this.opts.padding
    minY -= this.opts.padding

    this.drawingWidth = Math.ceil(maxX - minX)
    this.drawingHeight = Math.ceil(maxY - minY)

    this.offsetX = -minX
    this.offsetY = -minY

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
   * @param vertexLabel
   * @param {Number} x The x position of the text.
   * @param {Number} y The y position of the text.
   * @param {String} elementName The name of the element (single-letter).
   */
  drawBall(vertexIdLabel, vertexIdValue, vertexLabel, x, y, elementName) {
    const ball = this.svgHelper.createElement('circle', {
      [vertexIdLabel]: vertexIdValue,
      label: vertexLabel,
      cx: x + this.offsetX,
      cy: y + this.offsetY,
      r: this.opts.bondLength / 4.5,
      fill: this.getColor(elementName)
    })

    this.vertices.push(ball)
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
      stroke: this.getColor('C'),
      'stroke-width': this.opts.strokeWidth
    })

    this.vertices.push(ring)
  }

  /**
   * Draw a dashed wedge on the canvas.
   * @param idLabel
   * @param idValue
   * @param bondLabel
   * @param {Line} line A line.
   */
  drawDashedWedge(idLabel, idValue, bondLabel, line) {
    if (isNaN(line.from.x) || isNaN(line.from.y) ||
      isNaN(line.to.x) || isNaN(line.to.y)) {
      return
    }

    const l = line.getLeftVector().clone()
    const r = line.getRightVector().clone()
    const normals = Vector2.normals(l, r)

    normals[0].normalize()
    normals[1].normalize()

    const isRightChiralCenter = line.getRightChiral()
    const [start, end] = isRightChiralCenter ? [r, l] : [l, r]

    const dir = Vector2.subtract(end, start).normalize()
    const length = line.getLength()
    const step = 1 / (length / (this.opts.bondThickness * this.opts.dashedWedgeSpacing))

    const gradient = this.createGradient(line)

    for (let t = -step / 10; t < 1.0; t += step) {
      const to = Vector2.multiplyScalar(dir, t * length)
      const startDash = Vector2.add(start, to)
      const width = this.opts.dashedWedgeWidth * t
      const dashOffset = Vector2.multiplyScalar(normals[0], width)

      startDash.subtract(dashOffset)
      const endDash = startDash.clone()
      endDash.add(Vector2.multiplyScalar(dashOffset, 2.0))

      this.drawLine(idLabel, idValue, bondLabel, new Line(startDash, endDash), false, gradient)
    }
  }

  /**
   * Draws a line.
   * @param idLabel
   * @param idValue
   * @param bondLabel
   * @param {Line} line A line.
   * @param {String} gradient gradient url. Defaults to null.
   */
  drawLine(idLabel, idValue, bondLabel, line, gradient = null) {
    const styles = [
      ['stroke-width', this.opts.strokeWidth],
      ['stroke-linecap', 'round']
    ].map(sub => sub.join(':')).join(';')

    const l = line.getLeftVector()
    const r = line.getRightVector()
    const fromX = l.x + this.offsetX
    const fromY = l.y + this.offsetY
    const toX = r.x + this.offsetX
    const toY = r.y + this.offsetY

    gradient = gradient || this.createGradient(line)

    const lineElem = this.svgHelper.createElement('line', {
      [idLabel]: idValue,
      label: bondLabel,
      x1: fromX,
      y1: fromY,
      x2: toX,
      y2: toY,
      style: styles,
      stroke: `url('#${gradient}')`
    })

    this.paths.push(lineElem)
  }

  /**
   * Draw a point.
   * @param vertexIdLabel
   * @param vertexIdValue
   * @param vertexLabel
   * @param {Number} x The x position of the point.
   * @param {Number} y The y position of the point.
   * @param {String} elementName The name of the element (single-letter).
   */
  drawPoint(vertexIdLabel, vertexIdValue, vertexLabel, x, y, elementName) {
    const mask = this.svgHelper.createElement('circle', {
      [`mask-${vertexIdLabel}`]: vertexIdValue,
      label: vertexLabel,
      cx: x + this.offsetX,
      cy: y + this.offsetY,
      r: '1.5',
      fill: 'black'
    })

    const point = this.svgHelper.createElement('circle', {
      [`point-${vertexIdLabel}`]: vertexIdValue,
      cx: x + this.offsetX,
      cy: y + this.offsetY,
      r: '0.75',
      fill: this.getColor(elementName)
    })

    this.maskElements.push(mask)
    this.vertices.push(point)
  }

  /**
   * Draw a text to the canvas.
   * @param vertexIdLabel
   * @param vertexIdValue
   * @param vertexLabel
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
  drawText(vertexIdLabel, vertexIdValue, vertexLabel, x, y, elementName, hydrogens, direction, isTerminal, charge, isotope, attachedPseudoElement = {}) {
    const pos = {
      x: x + this.offsetX,
      y: y + this.offsetY
    }

    let letterSpacing = 0
    let writingMode = 'horizontal-tb'
    let textOrientation = 'mixed'
    let textDirection = 'direction: ltr;'
    let xShift = null
    let yShift = null

    if (charge > 0) {
      direction = 'right'
    }

    const debug = false
    const directionColors = {
      right: 'red',
      left: 'blue',
      up: 'green',
      down: 'yellow'
    }

    // determine writing mode
    if (/up|down/.test(direction) && !isTerminal) {
      writingMode = 'vertical-rl'
      textOrientation = 'upright'
      letterSpacing = -2
    }

    if (direction === 'right' && isTerminal) {
      xShift = -1
      yShift = 4
    }
    if (direction === 'right' && !isTerminal) {
      xShift = -5.0
      yShift = 5.0
    }

    if (direction === 'left' && isTerminal) {
      xShift = -1.5
      yShift = 3
      textDirection = 'direction: rtl;'
    }
    if (direction === 'left' && !isTerminal) {
      xShift = 3.5
      yShift = 3.5
      textDirection = 'direction: rtl;'
    }

    if (direction === 'up' && isTerminal) {
      xShift = 2.0
      yShift = 4.5
      textDirection = 'direction: rtl;'
    }
    if (direction === 'up' && !isTerminal) {
      xShift = 2
      yShift = 6
      textDirection = 'direction: rtl;'
    }

    if (direction === 'down' && isTerminal) {
      xShift = -3.5
      yShift = 3.5
    }
    if (direction === 'down' && !isTerminal) {
      xShift = 0
      yShift = -5
    }

    if (xShift === null || yShift === null) {
      throw new Error(`not implemented: conditions did not capture layout direction=${direction} and isTerminal=${isTerminal}`)
    }

    const currentColor = this.getColor(elementName)
    const textElem = this.svgHelper.createElement('text', {
      [`${vertexIdLabel}`]: vertexIdValue,
      label: vertexLabel,
      direction: direction,
      x: pos.x + xShift,
      y: pos.y + yShift,
      class: 'element',
      fill: debug ? directionColors[direction] : currentColor,
      style: `text-anchor: start;writing-mode: ${writingMode};text-orientation: ${textOrientation};letter-spacing: ${letterSpacing}px;${textDirection}`
    })

    const textNode = this.svgHelper.createElement('tspan')
    // special case for element names that are 2 letters
    if (elementName.length > 1) {
      const textAnchor = /up|down/.test(direction) ? 'middle' : 'start'
      this.svgHelper.update(textNode, {
        [`text-node-${vertexIdLabel}`]: vertexIdValue,
        style: `unicode-bidi: plaintext;writing-mode: lr-tb;letter-spacing: normal;text-anchor: ${textAnchor};`
      })
    }

    this.svgHelper.appendChildren(textNode, [document.createTextNode(elementName)])
    this.svgHelper.appendChildren(textElem, [textNode])

    // Charge
    if (charge) {
      this.svgHelper.appendChildren(textNode, [this.createSubSuperScripts(this.getChargeText(charge), 'super', currentColor)])
    }

    if (isotope > 0) {
      this.svgHelper.appendChildren(textNode, [this.createSubSuperScripts(isotope.toString(), 'super', currentColor)])
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
      const hydrogenElem = document.createElementNS('http://www.w3.org/2000/svg', 'tspan')
      hydrogenElem.setAttributeNS(null, 'style', 'unicode-bidi: plaintext;')
      hydrogenElem.appendChild(document.createTextNode('H'))
      textElem.appendChild(hydrogenElem)

      if (hydrogens > 1) {
        const hydrogenCountElem = this.createSubSuperScripts(hydrogens, 'sub', currentColor)
        hydrogenElem.appendChild(hydrogenCountElem)
      }
    }

    for (const key in attachedPseudoElement) {
      if (!attachedPseudoElement.hasOwnProperty(key)) {
        continue
      }

      const element = attachedPseudoElement[key].element
      const elementCount = attachedPseudoElement[key].count
      const hydrogenCount = attachedPseudoElement[key].hydrogenCount
      const elementCharge = attachedPseudoElement[key].charge
      const pseudoElementElem = document.createElementNS('http://www.w3.org/2000/svg', 'tspan')

      pseudoElementElem.setAttributeNS(null, 'style', 'unicode-bidi: plaintext;')
      pseudoElementElem.appendChild(document.createTextNode(element))
      pseudoElementElem.setAttributeNS(null, 'fill', this.getColor(element))

      if (elementCharge !== 0) {
        const elementChargeElem = this.createSubSuperScripts(this.getChargeText(elementCharge), 'super', currentColor)
        pseudoElementElem.appendChild(elementChargeElem)
      }

      if (hydrogenCount > 0) {
        const pseudoHydrogenElem = document.createElementNS('http://www.w3.org/2000/svg', 'tspan')

        pseudoHydrogenElem.setAttributeNS(null, 'style', 'unicode-bidi: plaintext;')
        pseudoHydrogenElem.appendChild(document.createTextNode('H'))
        pseudoElementElem.appendChild(pseudoHydrogenElem)

        if (hydrogenCount > 1) {
          const hydrogenCountElem = this.createSubSuperScripts(hydrogenCount, 'sub', currentColor)
          pseudoHydrogenElem.appendChild(hydrogenCountElem)
        }
      }

      if (elementCount > 1) {
        const elementCountElem = this.createSubSuperScripts(elementCount, 'sub', currentColor)
        pseudoElementElem.appendChild(elementCountElem)
      }

      textElem.appendChild(pseudoElementElem)
    }

    this.vertices.push(textElem)
  }

  /**
   * @param idLabel
   * @param idValue
   * @param bondLabel
   * @param {Line} line the line object to create the wedge from
   */
  drawWedge(idLabel, idValue, bondLabel, line) {
    // TODO aneb: make method for this since it exists for every line
    const l = line.getLeftVector().clone()
    const r = line.getRightVector().clone()

    l.x += this.offsetX
    l.y += this.offsetY

    r.x += this.offsetX
    r.y += this.offsetY

    const normals = Vector2.normals(l, r)

    normals[0].normalize()
    normals[1].normalize()

    const isRightChiralCenter = line.getRightChiral()
    const [start, end] = isRightChiralCenter ? [l, r] : [r, l]

    const t = Vector2.add(start, Vector2.multiplyScalar(normals[0], this.halfBondThickness))
    const u = Vector2.add(end, Vector2.multiplyScalar(normals[0], this.opts.wedgeBaseWidth + this.halfBondThickness))
    const v = Vector2.add(end, Vector2.multiplyScalar(normals[1], this.opts.wedgeBaseWidth + this.halfBondThickness))
    const w = Vector2.add(start, Vector2.multiplyScalar(normals[1], this.halfBondThickness))

    const polygon = this.svgHelper.createElement('polygon', {
      [idLabel]: idValue,
      label: bondLabel,
      points: `${t.x},${t.y} ${u.x},${u.y} ${v.x},${v.y} ${w.x},${w.y}`,
      fill: `url('#${this.createGradient(line)}')`
    })

    this.paths.push(polygon)
  }
}

module.exports = SvgWrapper
