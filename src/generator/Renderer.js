const crypto = require('crypto')
const fs = require('fs-extra')
const puppeteer = require('puppeteer')
const util = require('util')
const exec = util.promisify(require('child_process').exec)
const _ = require('lodash')
const { JSDOM } = require('jsdom')
const { xml2js, js2xml } = require('xml-js')

const Parser = require('../drawer/Parser')
const SvgDrawer = require('../drawer/SvgDrawer')
const SVG = require('./SVG')
const { bondLabels, labelTypes } = require('./types')
const { getPositionInfoFromSvg, resizeImage, drawMasksAroundTextElements } = require('./browser')

let maxLength = 0

const setIntersection = (setA, setB) => {
  const _intersection = new Set()
  for (const elem of setB) {
    if (setA.has(elem)) {
      _intersection.add(elem)
    }
  }
  return _intersection
}

const randomInt = (min, max) => {
  min = Math.ceil(min)
  max = Math.floor(max)
  return Math.floor(Math.random() * (max - min + 1)) + min
}

const noiseValue = (baseValue, noiseFactor = 0.3) => {
  const min = 0
  const max = noiseFactor
  const noise = Math.random() * (max - min) + min
  return baseValue + baseValue * noise
}

const imageFilter = () => {
  const r = randomInt(0, 9)

  // aneb: 10% of images do not get any filter
  if (r === 5) {
    return ''
  }

  const filters = {
    'hue-rotate': ['0deg', '30deg', '60deg', '90deg'],
    blur: ['0.50px', '0.75px', '1px', '1.1px', '1.2px', '1.25px', '1.3px'],
    invert: ['5%', '10%', '15%'],
    grayscale: ['0%', '20%', '40%', '60%', '80%', '100%'],
    contrast: ['50%', '75%', '100%', '125%', '150%']
  }

  let filterChain = ''
  for (const [filter, value] of Object.entries(filters)) {
    filterChain += ` ${filter}(${_.sample(value)})`
  }

  return `filter: ${filterChain};`
}

function Renderer({ outputDirectory, size, fonts, fontWeights, preserveAspectRatio, concurrency, labelType, segment, outputSvg, outputLabels, outputFlat }) {
  // aneb: find out why this does not work in above scope ...
  const colorMap = require('./colors')

  this.parser = Parser
  this.directory = outputDirectory
  this.size = size
  this.fonts = fonts
  this.fontWeights = fontWeights
  this.preserveAspectRatio = preserveAspectRatio
  this.colorMap = colorMap
  this.concurrency = concurrency
  this.labelType = labelType
  this.segment = segment
  this.outputSvg = outputSvg
  this.outputLabels = outputLabels
  this.outputFlat = outputFlat
  this.setContentOptions = { waitUntil: 'domcontentloaded', timeout: 2000 }

  this.svgHelper = new SVG()

  const { document, XMLSerializer } = (new JSDOM('')).window
  this.document = document
  this.XMLSerializer = new XMLSerializer()
}

Renderer.prototype.id = function(x) {
  return crypto.createHash('sha256').update(x).digest('hex')
}

Renderer.prototype.color = function(color, circle = false) {
  const fill = this.segment || circle ? color : 'none'
  return `fill: ${fill}; stroke: ${color};`
}

Renderer.prototype.makeEdgeAttributesNumeric = function(edge) {
  // aneb: one can only read html attributes as strings, postprocessing is done in one place to avoid handling
  // all types of bonds in browser code which cannot be debugged

  // wedge solid bond is drawn as polygon, all others are drawn from single lines which need to be merged
  if (edge.label === bondLabels.wedgeSolid) {
    edge.points = _.chunk(edge.points.split(/,|\s/).map(p => Number(p)), 2)
    return edge
  }

  for (const pos of ['x1', 'y1', 'x2', 'y2']) {
    edge[pos] = Number(edge[pos])
  }

  return edge
}

Renderer.prototype.positionInfoFromSvgXml = async function(page, xml) {
  // aneb: need to open browser, getBBox is not available via jsdom as it does not render
  await page.setContent(xml, this.setContentOptions)

  const dom = await page.evaluate(getPositionInfoFromSvg)
  dom.edges = dom.edges.map(e => this.makeEdgeAttributesNumeric(e))

  return {
    dom,
    xml
  }
}

Renderer.prototype.updateXmlAttributes = function(attributes) {
  const update = ['x', 'y', 'r', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy']

  for (const attr of update) {
    if (!attributes[attr]) {
      continue
    }

    attributes[attr] = Number(attributes[attr]).toFixed(4)
  }

  if (attributes.points) {
    attributes.points = _.chunk(attributes.points.split(/,|\s/).map(n => Number(n).toFixed(4)), 2).join(' ')
  }

  return attributes
}

Renderer.prototype.updateXmlNode = function(node) {
  if (node.attributes) {
    node.attributes = this.updateXmlAttributes(node.attributes)
  }

  if (node.elements && node.elements.length) {
    node.elements = node.elements.map(c => this.updateXmlNode(c))
  }

  return node
}

Renderer.prototype.cleanupLabel = function(label) {
  delete label.style

  if (label.points) {
    label.points = _.chunk(label.points.split(/,|\s/).map(p => Number(p)), 2)
    return label
  }

  if (label.cx && label.cy) {
    label.points = [[label.cx, label.cy]]
    delete label.cx && delete label.cy && delete label.r
    return label
  }

  throw new Error('the label is neither a polygon nor a point!')
}

Renderer.prototype.groupLabels = function(labels) {
  const groups = _.groupBy(labels, 'label-id')
  const result = []
  for (const [id, elementLabels] of Object.entries(groups)) {
    const text = elementLabels[0].text
    const label = elementLabels[0].label
    const xy = elementLabels.map(p => p.xy.toString()).join(' ')
    result.push({ id, label, xy, text })
  }

  return _.sortBy(result, 'id')
}

Renderer.prototype.saveResizedImage = async function(page, smiles, svg, fileName, quality, jsonOnly = false) {
  await page.setContent(svg, this.setContentOptions)
  let [updatedSvg, labels, matrix] = await page.evaluate(resizeImage, { size: this.size, preserveAspectRatio: this.preserveAspectRatio })

  await page.setContent(updatedSvg, this.setContentOptions)
  updatedSvg = await page.evaluate(drawMasksAroundTextElements)

  if (updatedSvg.length > maxLength) {
    console.log(`maxLength increased from ${maxLength} to ${updatedSvg.length}`)
    maxLength = updatedSvg.length
  }

  const ops = []

  if (!jsonOnly) {
    const updatedSvgElement = await page.$('svg')
    const capture = updatedSvgElement.screenshot({
      path: `${fileName}.jpg`,
      omitBackground: false,
      quality: quality
    })
    ops.push(capture)
  }

  if (this.outputLabels && labels.length) {
    const cleanLabels = labels
      .map(l => this.cleanupLabel(l))
      .map(l => ({ ...l, xy: this.svgHelper.transformPoints(l, matrix) }))

    const finalLabels = this.groupLabels(cleanLabels)

    // ops.push(fs.writeFile(`${fileName}-meta.json`, JSON.stringify({ smiles }, null, 2)))
    ops.push(fs.writeFile(`${fileName}.json`, JSON.stringify(finalLabels, null, 2)))
  }

  if (this.outputSvg) {
    const updatedSvgXml = js2xml(this.updateXmlNode(xml2js(updatedSvg)), {
      spaces: 2,
      compact: false
    })
    ops.push(fs.writeFile(`${fileName}-after.svg`, updatedSvgXml))
  }

  await Promise.all(ops)
}

Renderer.prototype.smilesToSvgXml = function(smiles) {
  const tree = this.parser.parse(smiles)
  const font = this.fonts[randomInt(0, this.fonts.length - 1)]
  const fontWeight = this.fontWeights[randomInt(0, this.fontWeights.length - 1)]

  // aneb: need to keep layout relatively constant
  const baseValue = Math.round(this.size / noiseValue(5, 5))

  const options = {
    overlapSensitivity: 1e-5,
    overlapResolutionIterations: 50,
    strokeWidth: `${noiseValue(1.5, 2)}`,
    gradientOffset: noiseValue(10, 10),
    wedgeBaseWidth: baseValue * 0.33,
    dashedWedgeSpacing: baseValue * 0.2,
    dashedWedgeWidth: baseValue * 0.75,
    bondThickness: baseValue * 0.1,
    bondLength: baseValue * 3,
    shortBondLength: 0.85,
    bondSpacing: baseValue * 0.20 * 0.18 * 15,
    font: font,
    fontWeight: fontWeight,
    fontSizeLarge: baseValue * 0.99,
    fontSizeSmall: baseValue * 0.50,
    padding: baseValue * 5,
    terminalCarbons: randomInt(0, 100) % 2 === 0,
    explicitHydrogens: randomInt(0, 100) % 2 === 0
  }

  // aneb: filter includes ";" or is empty string
  const filter = imageFilter()
  const colors = this.colorMap
  const style = `stroke-width: 0px; background-color: ${colors.BACKGROUND};${filter}`
  const svg = this.document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  const drawer = new SvgDrawer({ colors, options })

  drawer.draw(tree, svg)

  // aneb: must set other properties after drawing
  this.svgHelper.update(svg, { style, smiles })

  return this.XMLSerializer.serializeToString(svg)
}

Renderer.prototype.getCornersAligned = function({ x, y, width: w, height: h }) {
  const dx = w
  const dy = h

  // aneb: they are drawn in the order that is defined, so it is closed at (x,y) again
  return [
    [x, y],
    [x + dx, y],
    [x + dx, y + dy],
    [x, y + dy]
  ]
}

Renderer.prototype.getCornersOriented = function(edge) {
  // aneb: wedge is already drawn as polygon, all others are just lines, get polygon around lines and then treat both equally
  if (edge.label === bondLabels.wedgeSolid) {
    return [edge.points]
  }

  return this.svgHelper.getEdgePointsOfBoxAroundLine(edge)
}

Renderer.prototype.drawPoints = function({ id, label, points, text }) {
  const color = this.svgHelper.randomColor()

  // aneb: try to avoid overlapping points by using different sizes
  const size = _.floor(_.random(true) * 5 + 2) / 10
  return points.map(([x, y]) => {
    return this.svgHelper.createElement('circle', {
      'label-id': `${id}-label`,
      label: label,
      text: text,
      cx: x,
      cy: y,
      r: size,
      style: this.color(color, true)
    })
  })
}

Renderer.prototype.drawSinglePolygon = function({ id, label, points, text }) {
  const color = this.svgHelper.randomColor()
  return this.svgHelper.createElement('polygon', {
    'label-id': `${id}-label`,
    label: label,
    text: text,
    points: points.join(' '),
    style: this.color(color)
  })
}

Renderer.prototype.drawMultiPolygon = function(edgeElements) {
  const color = this.svgHelper.randomColor()
  const { id, label } = edgeElements[0]
  const points = edgeElements.map(e => this.getCornersOriented(e)).filter(e => !!e)
  return points.map(point => {
    return this.svgHelper.createElement('polygon', {
      'label-id': `${id}-label`,
      label: label,
      points: point.join(' '),
      style: this.color(color)
    })
  })
}

Renderer.prototype.addLabels = function({ dom, xml }) {
  const svg = new JSDOM(xml).window.document.documentElement.querySelector('svg')

  const nodeCorners = dom.nodes.map(n => ({ ...n, points: this.getCornersAligned(n) }))
  const nodeLabels = this.labelType === labelTypes.points && !this.segment
    ? nodeCorners.map(n => this.drawPoints(n))
    : nodeCorners.map(n => this.drawSinglePolygon(n))

  const edgeLabels = []

  if (this.labelType === labelTypes.box) {
    const correctedEdges = dom.edges.map(e => ({ ...e, ...this.svgHelper.correctBoundingBox(e) }))
    const merged = this.svgHelper.mergeBoundingBoxes(correctedEdges)
    const mergedWithPoints = merged.map(n => ({ ...n, points: this.getCornersAligned(n) }))
    edgeLabels.push(...mergedWithPoints.map(e => this.drawSinglePolygon(e)))
  }

  if (this.labelType === labelTypes.oriented) {
    const groupedEdges = _.groupBy(dom.edges, 'id')
    const tightBoxes = Object.values(groupedEdges).map(edge => this.drawMultiPolygon(edge))
    edgeLabels.push(tightBoxes)
  }

  if (this.labelType === labelTypes.points) {
    const points = dom.edges.map(e => ({ ...e, points: this.getCornersOriented(e) })).filter(e => !!e.points)
    const hull = Object.values(_.groupBy(points, 'id')).map(e => this.svgHelper.hull(e))
    const hullBox = this.segment
      ? hull.map(edge => this.drawSinglePolygon(edge))
      : hull.map(edge => this.drawPoints(edge))

    edgeLabels.push(hullBox)
  }

  this.svgHelper.appendChildren(svg, [...nodeLabels, ...edgeLabels])

  return this.XMLSerializer.serializeToString(svg)
}

Renderer.prototype.imageFromSmilesString = async function(page, smiles) {
  const svgXmlWithoutLabels = this.smilesToSvgXml(smiles)
  const { dom, xml } = await this.positionInfoFromSvgXml(page, svgXmlWithoutLabels)

  // aneb: these are only at the original size, the final labels are computed after image has been resized
  const svgXmlWithLabels = this.addLabels({ dom, xml })
  const id = this.id(smiles)
  const quality = randomInt(50, 100)

  if (!this.outputFlat) {
    const target = `${this.directory}/${id}`

    await fs.ensureDir(target)

    try {
      await this.saveResizedImage(page, smiles, svgXmlWithoutLabels, `${target}/x`, quality, false)
      await this.saveResizedImage(page, smiles, svgXmlWithLabels, `${target}/y`, 100, true)
    } catch (e) {
      console.log(e)
      await fs.remove(target)
    }

    return
  }

  // aneb: debugging only
  await this.saveResizedImage(page, smiles, svgXmlWithoutLabels, `${this.directory}/${id}-x`, quality, false)
  await this.saveResizedImage(page, smiles, svgXmlWithLabels, `${this.directory}/${id}-y`, 100, true)
}

Renderer.prototype.processBatch = async function(index, smilesList) {
  const browserOptions = {
    headless: true,
    devtools: false
  }

  const logSize = Math.min(smilesList.length, 100)
  const browser = await puppeteer.launch(browserOptions)
  const page = await browser.newPage()

  for (const [i, smiles] of smilesList.entries()) {
    try {
      if (i % logSize === 0) {
        console.log(`${new Date().toUTCString()} worker ${index}: ${i}/${smilesList.length} done`)
      }

      await this.imageFromSmilesString(page, smiles)
    } catch (e) {
      console.error(`failed to process SMILES string '${smiles}'`, e.message)
    }
  }

  console.log(`${new Date().toUTCString()} worker ${index}: done`)
  await page.close()
  await browser.close()
}

Renderer.prototype.imagesFromSmilesList = async function(smilesList) {
  const label = `generating ${smilesList.length} images with concurrency ${this.concurrency}`
  console.time(label)

  const xCmd = `find ${this.directory} -type f -name 'x.*'`
  const yCmd = `find ${this.directory} -type f -name 'y.*'`
  console.log(xCmd)
  console.log(yCmd)

  let x = await exec(xCmd, { maxBuffer: 100 * 1024 * 1024 })
  let y = await exec(yCmd, { maxBuffer: 100 * 1024 * 1024 })
  x = x.stdout.split('\n').map(x => x.split('/').slice(-2)[0])
  y = y.stdout.split('\n').map(x => x.split('/').slice(-2)[0])

  const existing = setIntersection(new Set(x), new Set(y))

  const smilesToId = {}
  for (const smiles of smilesList) {
    const id = this.id(smiles)
    smilesToId[smiles] = existing.has(id) ? null : id
  }

  const missing = smilesList.filter(x => !!smilesToId[x])
  console.log(`removed ${smilesList.length - missing.length} items, ${missing.length} left`)

  const batches = _.chunk(missing, Math.ceil(missing.length / this.concurrency))
  await Promise.all(batches.map((batch, index) => this.processBatch(index, batch)))
  console.timeEnd(label)
}

module.exports = Renderer
