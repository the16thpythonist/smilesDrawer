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

  // aneb: labels means targets for training
  if (labels.length) {
    labels = labels
      .map(pair => pair.reduce((p, c) => Object.assign(p, c), {}))
      .map(({ label, x, y, width, height }) => ({ label, x, y, width, height }))

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

Renderer.prototype.makeBoundingBox = function(id, label, x, y, width, height) {
  const randomColor = Math.floor(Math.random() * 16777215).toString(16).slice(-4)
  return this.svg.createElement('rect', {
    'bb-id': `${id}-bb`,
    label: label,
    x: x,
    y: y,
    width: width,
    height: height,
    style: `fill: none; stroke: #a2${randomColor}; stroke-width: 0.5`
  })
}

Renderer.prototype.makeTightBoundingBox = function(id, edge) {
  const edgeLabel = edge[0].label
  if (edgeLabel === bondLabels.wedgeSolid) {
    return
  }

  if (edgeLabel === bondLabels.wedgeDashed) {
    return
  }

  if (edgeLabel === bondLabels.double || edgeLabel === bondLabels.triple) {

  }
}

Renderer.prototype.mergeBoundingBoxes = function(boxes) {
  const groups = _.groupBy(boxes, 'id')
  return Object.values(groups).map(g => this.getBoxWithMaxArea(g))
}

Renderer.prototype.boundingBoxToRect = function(bb) {
  const { x, y, width: w, height: h } = bb
  return { top: y, bottom: y + h, left: x, right: x + w }
}

Renderer.prototype.getBoxWithMaxArea = function(bonds) {
  if (bonds.length === 1) {
    return bonds[0]
  }

  const rects = bonds.map(bb => this.boundingBoxToRect(bb))

  const minY = Math.min(...rects.map(r => r.top))
  const maxY = Math.max(...rects.map(r => r.bottom))
  const minX = Math.min(...rects.map(r => r.left))
  const maxX = Math.max(...rects.map(r => r.right))
  const update = { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
  return Object.assign(bonds[0], update)
}

Renderer.prototype.correctBoundingBox = function(x, y, width, height) {
  const minValue = 0.5
  const newValue = 2
  let [xCorr, yCorr, widthCorr, heightCorr] = [x, y, width, height]

  if (heightCorr < minValue) {
    heightCorr = newValue
    yCorr -= newValue / 2
  }

  if (widthCorr < minValue) {
    widthCorr = newValue
    xCorr -= newValue / 2
  }

  return { x: xCorr, y: yCorr, width: widthCorr, height: heightCorr }
}

Renderer.prototype.addBoundingBoxesToSvg = function({ dom, xml }) {
  const svg = new JSDOM(xml).window.document.documentElement.querySelector('svg')
  const bbContainer = this.svg.createElement('g')

  for (const { id, label, x, y, width, height } of dom.nodes) {
    const bb = this.makeBoundingBox(id, label, x, y, width, height)
    bbContainer.appendChild(bb)
  }

  const correctedEdges = dom.edges.map(e => Object.assign(e, this.correctBoundingBox(e.x, e.y, e.width, e.height)))
  const merged = this.mergeBoundingBoxes(correctedEdges)
  for (const { id, label, x, y, width, height } of merged) {
    const bb = this.makeBoundingBox(id, label, x, y, width, height)
    bbContainer.appendChild(bb)
  }

  svg.appendChild(bbContainer)

  return this.XMLSerializer.serializeToString(svg)
}

Renderer.prototype.addTightBoundingBoxesToSvg = function({ dom, xml }) {
  // TODO aneb: remove duplicate code fragments after all label types are implemented correctly
  const svg = new JSDOM(xml).window.document.documentElement.querySelector('svg')
  const bbContainer = this.svg.createElement('g')

  for (const { id, label, x, y, width, height } of dom.nodes) {
    const bb = this.makeBoundingBox(id, label, x, y, width, height)
    bbContainer.appendChild(bb)
  }

  const groupedEdges = _.groupBy(dom.edges, 'id')
  for (const [id, edge] of Object.entries(groupedEdges)) {
    const bb = this.makeTightBoundingBox(id, edge)
    bbContainer.appendChild(bb)
  }

  svg.appendChild(bbContainer)
}

Renderer.prototype.addLabels = function({ dom, xml }) {
  if (this.labelType === labelTypes.box) {
    return this.addBoundingBoxesToSvg({ dom, xml })
  }

  if (this.labelType === labelTypes.tight) {
    return this.addTightBoundingBoxesToSvg({ dom, xml })
  }

  if (this.labelType === labelTypes.points) {
    throw new Error(`${this.labelType} not implemented yet`)
  }
}

Renderer.prototype.imageFromSmilesString = async function(page, smiles, filePrefix, fileIndex) {
  const svgXmlWithoutBoundingBoxes = this.smilesToSvgXml(smiles)
  const { dom, xml } = await this.positionInfoFromSvgXml(page, svgXmlWithoutBoundingBoxes)

  // TODO aneb: define different styles of labels, then make style configurable
  const svgXmlWithLabels = this.addLabels({ dom, xml })

  const fileName = `${this.directory}/${filePrefix}-${fileIndex}`
  await this.saveResizedImage(page, svgXmlWithoutBoundingBoxes, `${fileName}-x`, this.quality)
  await this.saveResizedImage(page, svgXmlWithLabels, `${fileName}-y`, 100)
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
