const fs = require('fs-extra')
const puppeteer = require('puppeteer')
const _ = require('lodash')
const { JSDOM } = require('jsdom')
const { xml2js, js2xml } = require('xml-js')

const Parser = require('../drawer/Parser')
const SvgDrawer = require('../drawer/SvgDrawer')
const SVG = require('./SVG')
const { bondLabels, labelTypes } = require('./types')

const { getPositionInfoFromSvg, resizeImage } = require('./browser')

function Renderer({ outputDirectory, quality, scale, colors, concurrency, labelType }) {
  this.browser = null
  this.pages = null
  this.document = null
  this.XMLSerializer = null

  this.parser = Parser

  this.directory = outputDirectory
  this.quality = quality
  this.scale = scale
  this.concurrency = concurrency
  this.labelType = labelType

  // TODO define options?
  this.drawer = new SvgDrawer({ colors })
  this.svg = new SVG()
}

Renderer.prototype.init = async function() {
  const { document, XMLSerializer } = (new JSDOM('')).window
  this.document = document
  this.XMLSerializer = new XMLSerializer()

  this.browser = await puppeteer.launch({ headless: true, devtools: false })
  this.pages = await Promise.all(Array(this.concurrency).fill(null).map(() => this.browser.newPage()))

  await fs.ensureDir(this.directory)
}

Renderer.prototype.done = async function() {
  this.browser.close()
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
  await page.setContent(xml, { waitUntil: 'domcontentloaded' })

  const dom = await page.evaluate(getPositionInfoFromSvg)
  dom.edges = dom.edges.map(e => this.makeEdgeAttributesNumeric(e))

  return { dom, xml }
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

Renderer.prototype.saveResizedImage = async function(page, svg, fileName, quality) {
  await page.setContent(svg, { waitUntil: 'domcontentloaded' })

  let [updatedSvg, labels] = await page.evaluate(resizeImage, this.scale)

  const updatedSvgElement = await page.$('svg')
  const updatedSvgXml = js2xml(this.updateXmlNode(xml2js(updatedSvg)), { spaces: 2, compact: false })

  const ops = [
    updatedSvgElement.screenshot({ path: `${fileName}-quality-${quality}.jpeg`, omitBackground: false, quality: quality }),
    fs.writeFile(`${fileName}.svg`, updatedSvgXml)
  ]

  // aneb: the x image has no labels
  if (labels.length) {
    // TODO aneb: filter properties instead of choosing
    labels = labels.map(pair => pair.reduce((p, c) => Object.assign(p, c), {}))
    ops.push(fs.writeFile(`${fileName}.labels.json`, JSON.stringify(labels, null, 2)))
  }

  await Promise.all(ops)
}

Renderer.prototype.smilesToSvgXml = function(smiles) {
  const svg = this.document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  const tree = this.parser.parse(smiles)

  this.drawer.draw(tree, svg)
  this.svg.update(svg, { smiles })

  return this.XMLSerializer.serializeToString(svg)
}

Renderer.prototype.makeBoundingBox = function({ id, label, x, y, width, height, color }) {
  return this.svg.createElement('rect', {
    'label-id': `${id}-label`,
    label: label,
    x: x,
    y: y,
    width: width,
    height: height,
    style: `fill: none; stroke: ${color || this.svg.randomColor()}; stroke-width: 0.5`
  })
}

Renderer.prototype.makeBoundingBoxAroundLine = function({ id, label, x1, y1, x2, y2, color }) {
  const points = this.svg.getEdgePointsOfBoxAroundLine({ x1, y1, x2, y2 })

  return this.svg.createElement('polygon', {
    'label-id': `${id}-label`,
    label: label,
    points: points.join(' '),
    style: `fill: none; stroke: ${color}; stroke-width: 0.5`
  })
}

Renderer.prototype.makeTightBoundingBox = function(id, edgeElements, color) {
  const first = edgeElements[0]
  if (first.label === bondLabels.wedgeSolid) {
    return this.svg.createElement('polygon', {
      'label-id': `${id}-label`,
      label: first.label,
      points: first.points.join(' '),
      style: `fill: none; stroke: ${color}; stroke-width: 0.5`
    })
  }

  // aneb: all others are just arrays of lines
  const boxes = edgeElements.map(e => this.makeBoundingBoxAroundLine(({ ...e, color })))
  return this.svg.createElement('g', { id: `${id}-container` }, boxes)
}

Renderer.prototype.addLabels = function({ dom, xml }) {
  const svg = new JSDOM(xml).window.document.documentElement.querySelector('svg')

  const nodeLabels = dom.nodes.map(node => this.makeBoundingBox({ ...node, color: this.svg.randomColor() }))

  let edgeLabels

  if (this.labelType === labelTypes.box) {
    const correctedEdges = dom.edges.map(e => Object.assign(e, this.svg.correctBoundingBox(e.x, e.y, e.width, e.height)))
    const merged = this.svg.mergeBoundingBoxes(correctedEdges)
    edgeLabels = merged.map(edge => this.makeBoundingBox({ ...edge, color: this.svg.randomColor() }))
  }

  if (this.labelType === labelTypes.tight) {
    const groupedEdges = _.groupBy(dom.edges, 'id')
    edgeLabels = Object.entries(groupedEdges).map(([id, edge]) => this.makeTightBoundingBox(id, edge, this.svg.randomColor()))
  }

  if (this.labelType === labelTypes.points) {
    throw new Error(`${this.labelType} not implemented yet`)
  }
  const container = this.svg.createElement('g', null, [...nodeLabels, ...edgeLabels])
  svg.appendChild(container)

  return this.XMLSerializer.serializeToString(svg)
}

Renderer.prototype.imageFromSmilesString = async function(page, smiles, filePrefix, fileIndex) {
  const svgXmlWithoutLabels = this.smilesToSvgXml(smiles)
  const { dom, xml } = await this.positionInfoFromSvgXml(page, svgXmlWithoutLabels)

  const svgXmlWithLabels = this.addLabels({ dom, xml })

  const fileName = `${this.directory}/${filePrefix}-${fileIndex}`
  await this.saveResizedImage(page, svgXmlWithoutLabels, `${fileName}-${this.labelType}-x`, this.quality)
  await this.saveResizedImage(page, svgXmlWithLabels, `${fileName}-${this.labelType}-y`, 100)
}

Renderer.prototype.processBatch = async function(page, smilesList, filePrefix, batchIndex, idOffset) {
  const logEvery = 10
  const progress = Math.ceil(smilesList.length / logEvery)
  for (const [i, smiles] of smilesList.entries()) {
    const fileIndex = idOffset + i

    await this.imageFromSmilesString(page, smiles, filePrefix, fileIndex)
    if (i % progress === 0) {
      console.log(`batch #${batchIndex} progress: ${100 * +(i / smilesList.length).toFixed(1)}%`)
    }
  }

  console.log(`batch #${batchIndex} progress: 100%`)
}

Renderer.prototype.imagesFromSmilesList = async function(smilesList, filePrefix = 'img') {
  const batchSize = Math.ceil(smilesList.length / this.concurrency)
  const batches = _.chunk(smilesList, batchSize)
  const label = `generating ${smilesList.length} images with concurrency ${this.concurrency}`

  console.time(label)
  await Promise.all(batches.map((batch, index) => this.processBatch(this.pages[index], batch, filePrefix, index, index * batchSize)))
  console.timeEnd(label)
}

module.exports = Renderer
