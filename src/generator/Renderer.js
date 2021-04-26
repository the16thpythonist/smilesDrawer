const crypto = require('crypto')
const fs = require('fs-extra')
const puppeteer = require('puppeteer')
const _ = require('lodash')
const { JSDOM } = require('jsdom')
const {
  xml2js,
  js2xml
} = require('xml-js')

const Parser = require('../drawer/Parser')
const SvgDrawer = require('../drawer/SvgDrawer')
const SVG = require('./SVG')
const {
  bondLabels,
  labelTypes
} = require('./types')

const {
  getPositionInfoFromSvg,
  resizeImage
} = require('./browser')

function Renderer({
  outputDirectory,
  quality,
  scale,
  colors,
  concurrency,
  labelType,
  segment,
  outputSvg,
  outputLabels
}) {
  this.document = null
  this.XMLSerializer = null

  this.parser = Parser

  this.directory = outputDirectory
  this.quality = quality
  this.scale = scale
  this.concurrency = concurrency
  this.labelType = labelType
  this.segment = segment
  this.outputSvg = outputSvg
  this.outputLabels = outputLabels

  // TODO define options?
  this.drawer = new SvgDrawer({ colors })
  this.svg = new SVG()

  const {
    document,
    XMLSerializer
  } = (new JSDOM('')).window
  this.document = document
  this.XMLSerializer = new XMLSerializer()
}

Renderer.prototype.uuid = function() {
  return crypto.randomBytes(16).toString('hex')
}

Renderer.prototype.color = function(color, circle = false) {
  const fill = this.segment || circle ? color : 'none'
  return `fill: ${fill}; stroke: ${color}; stroke-width: 0.5`
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
  for (const [id, points] of Object.entries(groups)) {
    const label = points[0].label
    const xy = points.map(p => p.xy.toString()).join(' ')
    result.push({
      id,
      label,
      xy
    })
  }

  return _.sortBy(result, 'id')
}

Renderer.prototype.saveResizedImage = async function(page, svg, fileName, quality) {
  await page.setContent(svg, { waitUntil: 'domcontentloaded' })
  const [updatedSvg, labels, matrix] = await page.evaluate(resizeImage, this.scale)
  const updatedSvgElement = await page.$('svg')
  const ops = [updatedSvgElement.screenshot({
    path: `${fileName}.jpg`,
    omitBackground: false,
    quality: quality
  })]

  if (this.outputLabels && labels.length) {
    const cleanLabels = labels
      .map(l => this.cleanupLabel(l))
      .map(l => ({
        ...l,
        xy: this.svg.transformPoints(l, matrix)
      }))

    const finalLabels = this.groupLabels(cleanLabels)

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
  const svg = this.document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  const tree = this.parser.parse(smiles)

  this.drawer.draw(tree, svg)
  this.svg.update(svg, { smiles })

  return this.XMLSerializer.serializeToString(svg)
}

Renderer.prototype.getCornersAligned = function({
  x,
  y,
  width: w,
  height: h
}) {
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

  return this.svg.getEdgePointsOfBoxAroundLine(edge)
}

Renderer.prototype.drawPoints = function({
  id,
  label,
  points
}) {
  const color = this.svg.randomColor()

  // aneb: try to avoid overlapping points by using different sizes
  const size = _.floor(_.random(true) * 5 + 2) / 10
  return points.map(([x, y]) => {
    return this.svg.createElement('circle', {
      'label-id': `${id}-label`,
      label: label,
      cx: x,
      cy: y,
      r: size,
      style: this.color(color, true)
    })
  })
}

Renderer.prototype.drawSinglePolygon = function({
  id,
  label,
  points
}) {
  const color = this.svg.randomColor()
  return this.svg.createElement('polygon', {
    'label-id': `${id}-label`,
    label: label,
    points: points.join(' '),
    style: this.color(color)
  })
}

Renderer.prototype.drawMultiPolygon = function(edgeElements) {
  const color = this.svg.randomColor()
  const {
    id,
    label
  } = edgeElements[0]
  const points = edgeElements.map(e => this.getCornersOriented(e)).filter(e => !!e)
  return points.map(point => {
    return this.svg.createElement('polygon', {
      'label-id': `${id}-label`,
      label: label,
      points: point.join(' '),
      style: this.color(color)
    })
  })
}

Renderer.prototype.addLabels = function({
  dom,
  xml
}) {
  const svg = new JSDOM(xml).window.document.documentElement.querySelector('svg')

  const nodeEdges = dom.nodes.map(n => ({
    ...n,
    points: this.getCornersAligned(n)
  }))
  const nodeLabels = this.labelType === labelTypes.points && !this.segment
    ? nodeEdges.map(n => this.drawPoints(n))
    : nodeEdges.map(n => this.drawSinglePolygon(n))

  const edgeLabels = []

  if (this.labelType === labelTypes.box) {
    const correctedEdges = dom.edges.map(e => ({ ...e, ...this.svg.correctBoundingBox(e) }))
    const merged = this.svg.mergeBoundingBoxes(correctedEdges)
    const mergedWithPoints = merged.map(n => ({
      ...n,
      points: this.getCornersAligned(n)
    }))
    edgeLabels.push(...mergedWithPoints.map(e => this.drawSinglePolygon(e)))
  }

  if (this.labelType === labelTypes.oriented) {
    const groupedEdges = _.groupBy(dom.edges, 'id')
    const tightBoxes = Object.values(groupedEdges).map(edge => this.drawMultiPolygon(edge))
    edgeLabels.push(tightBoxes)
  }

  if (this.labelType === labelTypes.points) {
    const points = dom.edges.map(e => ({
      ...e,
      points: this.getCornersOriented(e)
    })).filter(e => !!e.points)
    const hull = Object.values(_.groupBy(points, 'id')).map(e => this.svg.hull(e))
    const hullBox = this.segment
      ? hull.map(edge => this.drawSinglePolygon(edge))
      : hull.map(edge => this.drawPoints(edge))

    edgeLabels.push(hullBox)
  }

  this.svg.appendChildren(svg, [...nodeLabels, ...edgeLabels])

  return this.XMLSerializer.serializeToString(svg)
}

Renderer.prototype.imageFromSmilesString = async function(page, smiles) {
  const svgXmlWithoutLabels = this.smilesToSvgXml(smiles)
  const {
    dom,
    xml
  } = await this.positionInfoFromSvgXml(page, svgXmlWithoutLabels)

  // aneb: these are only at the original size, the final labels are computed after image has been resized
  const svgXmlWithLabels = this.addLabels({
    dom,
    xml
  })

  const target = `${this.directory}/${this.uuid()}`
  await fs.ensureDir(target)
  await this.saveResizedImage(page, svgXmlWithoutLabels, `${target}/x`, this.quality)
  await this.saveResizedImage(page, svgXmlWithLabels, `${target}/y`, 100)
}

Renderer.prototype.processBatch = async function(smilesList) {
  const browserOptions = {
    headless: true,
    devtools: false
  }
  const browser = await puppeteer.launch(browserOptions)
  const page = await browser.newPage()

  for (const smiles of smilesList) {
    try {
      await this.imageFromSmilesString(page, smiles)
    } catch (e) {
      console.error(`failed to process SMILES string '${smiles}'`, e.message)
    }
  }

  const pages = await browser.pages()
  await Promise.all(pages.map(p => p.close()))
  await browser.close()
}

Renderer.prototype.imagesFromSmilesList = async function(smilesList) {
  const label = `generating ${smilesList.length} images with concurrency ${this.concurrency}`
  const totalItems = smilesList.length
  const clearInterval = Math.min(smilesList.length, 1000)
  let iteration = 0
  console.time(label)

  while (smilesList.length) {
    console.log(`${new Date().toUTCString()} processing items ${iteration * clearInterval}-${iteration * clearInterval + clearInterval}/${totalItems}`)
    const currentBatch = smilesList.splice(0, clearInterval)
    const batchSize = Math.ceil(currentBatch.length / this.concurrency)
    const batches = _.chunk(currentBatch, batchSize)

    await Promise.all(batches.map((batch, index) => this.processBatch(batch)))

    ++iteration
  }

  console.timeEnd(label)
}

module.exports = Renderer
