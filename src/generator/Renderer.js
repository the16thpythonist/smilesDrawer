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

function Renderer({ outputDirectory, quality, scale, colors, concurrency, labelType, segment, outputSvg, outputLabels }) {
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
  this.segment = segment
  this.outputSvg = outputSvg
  this.outputLabels = outputLabels

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

Renderer.prototype.color = function(color) {
  const fill = this.segment ? color : 'none'
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

  const ops = [updatedSvgElement.screenshot({ path: `${fileName}-quality-${quality}.jpeg`, omitBackground: false, quality: quality })]

  // aneb: the x image has no labels
  if (labels.length) {
    labels = labels.map(pair => pair.reduce((p, c) => Object.assign(p, c), {}))

    for (const label of labels) {
      delete label.style
    }
  }

  if (this.outputLabels) {
    ops.push(fs.writeFile(`${fileName}.labels.json`, JSON.stringify(labels, null, 2)))
  }

  if (this.outputSvg) {
    ops.push(fs.writeFile(`${fileName}.svg`, updatedSvgXml))
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

Renderer.prototype.makeBoundingBoxRect = function({ id, label, x, y, width, height, color }) {
  return this.svg.createElement('rect', {
    'label-id': `${id}-label`,
    label: label,
    x: x,
    y: y,
    width: width,
    height: height,
    style: this.color(color)
  })
}

Renderer.prototype.getCornerPoints = function(edge) {
  // aneb: wedge is already drawn as polygon, all others are just lines, get polygon around lines and then treat both equally
  if (edge.label === bondLabels.wedgeSolid) {
    return [edge.points]
  }

  return this.svg.getEdgePointsOfBoxAroundLine(edge)
}

Renderer.prototype.makeBoundingBoxPolygon = function(edgeElements, color) {
  const { id, label } = edgeElements[0]
  const points = edgeElements.map(e => this.getCornerPoints(e)).filter(e => !!e)
  return points.map(point => {
    return this.svg.createElement('polygon', {
      'label-id': `${id}-label`,
      label: label,
      points: point.join(' '),
      style: this.color(color)
    })
  })
}

Renderer.prototype.makeHullPolygon = function(edge, color) {
  const { id, label, points } = edge[0]
  return this.svg.createElement('polygon', {
    'label-id': `${id}-label`,
    label: label,
    points: points.join(' '),
    style: this.color(color)
  })
}

Renderer.prototype.makeHullPoints = function(edge, color) {
  const { id, label, points } = edge[0]
  return points.map(([x, y]) => {
    return this.svg.createElement('circle', {
      'label-id': `${id}-label`,
      label: label,
      cx: x,
      cy: y,
      r: 0.25,
      style: this.color(color)
    })
  })
}

Renderer.prototype.addLabels = function({ dom, xml }) {
  const svg = new JSDOM(xml).window.document.documentElement.querySelector('svg')

  const nodeLabels = dom.nodes.map(node => this.makeBoundingBoxRect({ ...node, color: this.svg.randomColor() }))

  const edgeLabels = []

  if (this.labelType === labelTypes.box) {
    const correctedEdges = dom.edges.map(e => Object.assign(e, this.svg.correctBoundingBox(e.x, e.y, e.width, e.height)))
    const merged = this.svg.mergeBoundingBoxes(correctedEdges)
    const boundingBoxes = merged.map(edge => this.makeBoundingBoxRect({ ...edge, color: this.svg.randomColor() }))
    edgeLabels.push(...boundingBoxes)
  }

  if (this.labelType === labelTypes.tight) {
    const groupedEdges = _.groupBy(dom.edges, 'id')
    const tightBoxes = Object.values(groupedEdges).map(edge => this.makeBoundingBoxPolygon(edge, this.svg.randomColor()))
    edgeLabels.push(tightBoxes)
  }

  if (this.labelType === labelTypes.hull) {
    const points = dom.edges.map(e => ({ ...e, points: this.getCornerPoints(e) })).filter(e => !!e.points)
    const hull = Object.values(_.groupBy(points, 'id')).map(e => this.svg.hull(e))
    const hullBox = this.segment
      ? hull.map(edge => this.makeHullPolygon(edge, this.svg.randomColor()))
      : hull.map(edge => this.makeHullPoints(edge, this.svg.randomColor()))

    edgeLabels.push(hullBox)
  }

  this.svg.appendChildren(svg, [...nodeLabels, ...edgeLabels])

  return this.XMLSerializer.serializeToString(svg)
}

Renderer.prototype.imageFromSmilesString = async function(page, smiles, filePrefix, fileIndex) {
  const svgXmlWithoutLabels = this.smilesToSvgXml(smiles)
  const { dom, xml } = await this.positionInfoFromSvgXml(page, svgXmlWithoutLabels)

  const svgXmlWithLabels = this.addLabels({ dom, xml })

  const fileName = `${this.directory}/${filePrefix}-${fileIndex}-${this.labelType}${this.segment ? '-segment' : ''}`

  // await this.saveResizedImage(page, svgXmlWithoutLabels, `${fileName}-x`, this.quality)
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
