const fs = require('fs-extra')
const puppeteer = require('puppeteer')
const _ = require('lodash')

const Parser = require('../drawer/Parser')
const SvgDrawer = require('../drawer/SvgDrawer')
const SVG = require('./SVG')
const { JSDOM } = require('jsdom')

function Renderer ({ directory, quality, scale, colors }) {
  // TODO make own browser class?
  this.browser = null
  this.document = null
  this.XMLSerializer = null

  this.parser = Parser

  this.directory = directory
  this.quality = quality
  this.scale = scale

  // TODO define options?
  this.drawer = new SvgDrawer({ colors })
  this.svg = new SVG()
}

Renderer.prototype.init = async function () {
  const { document, XMLSerializer } = (new JSDOM('')).window
  this.document = document
  this.XMLSerializer = new XMLSerializer()
  this.browser = await puppeteer.launch({ headless: true, devtools: false })

  await fs.ensureDir(this.directory)
}

Renderer.prototype.done = async function () {
  this.browser.close()
}

Renderer.prototype.propertiesFromXmlString = async function (xml) {
  // aneb: need to open browser, getBBox is not available via jsdom as it does not render
  const page = await this.browser.newPage()
  await page.setContent(xml, { waitUntil: 'domcontentloaded' })

  const dom = await page.evaluate(() => {
    const nodes = []
    const edges = []

    const vertices = document.documentElement.querySelectorAll('[vertex-id]')
    for (const vertex of vertices) {
      const { x, y, width, height } = vertex.getBBox()
      const elements = Array.from(vertex.querySelectorAll('tspan')).map(c => c.textContent).filter(c => !!c)
      const id = vertex.getAttribute('vertex-id')
      const label = vertex.getAttribute('label')
      nodes.push({ id, elements, x, y, width, height, label })
    }

    const bonds = document.documentElement.querySelectorAll('[edge-id]')
    for (const bond of bonds) {
      const { x, y, width, height } = bond.getBBox()
      const id = bond.getAttribute('edge-id')
      const label = bond.getAttribute('label')
      edges.push({ id, x, y, width, height, label })
    }

    return { nodes, edges }
  })

  return { dom, xml }
}

Renderer.prototype.createRawSvgFromSmiles = function (smiles) {
  const svg = this.document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  const tree = this.parser.parse(smiles)

  this.drawer.draw(tree, svg, 'light', false)
  this.svg.update(svg, { smiles })

  return this.XMLSerializer.serializeToString(svg)
}

Renderer.prototype.saveAsPngWithProperSize = async function (svg, fileName) {
  const page = await this.browser.newPage()
  await page.setContent(svg, { waitUntil: 'domcontentloaded' })

  await page.evaluate((scale) => {
    const svg = document.querySelector('svg')
    const [height, width, viewbox] = ['height', 'width', 'viewBox'].map(property => svg.getAttributeNS(null, property))
    const [boxX, boxY, boxWidth, boxHeight] = viewbox.split(' ')

    svg.setAttributeNS(null, 'height', Math.ceil(height * scale))
    svg.setAttributeNS(null, 'width', Math.ceil(width * scale))
    svg.setAttributeNS(null, 'viewbox', `${boxX} ${boxY} ${boxWidth * scale} ${boxHeight * scale} `)
  }, this.scale)

  const svgEl = await page.$('svg')
  await svgEl.screenshot({ path: `${fileName}.jpeg`, omitBackground: false, quality: this.quality })
  await page.close()
}

Renderer.prototype.makeBoundingBox = function (id, label, x, y, width, height) {
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

Renderer.prototype.mergeBoundingBoxes = function (boxes) {
  const groups = _.groupBy(boxes, 'id')
  return Object.values(groups).map(g => this.getBoxWithMaxArea(g))
}

Renderer.prototype.boundingBoxToRect = function (bb) {
  const { x, y, width: w, height: h } = bb
  return { top: y, bottom: y + h, left: x, right: x + w }
}

Renderer.prototype.getBoxWithMaxArea = function (bonds) {
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

Renderer.prototype.correctBoundingBox = function (x, y, width, height) {
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

Renderer.prototype.addBoundingBoxesToSvg = function ({ dom, xml }) {
  const svg = new JSDOM(xml).window.document.documentElement.querySelector('svg')
  const bbContainer = this.svg.createElement('g')

  for (const { id, label, x, y, width, height } of dom.nodes) {
    const bb = this.makeBoundingBox(id, label, x, y, width, height)
    bbContainer.appendChild(bb)
  }

  const correctedEdges = dom.edges.map(({ id, label, x, y, width, height }) => Object.assign({ id, label }, this.correctBoundingBox(x, y, width, height)))
  const merged = this.mergeBoundingBoxes(correctedEdges)
  for (const { id, label, x, y, width, height } of merged) {
    const bb = this.makeBoundingBox(id, label, x, y, width, height)
    bbContainer.appendChild(bb)
  }

  svg.appendChild(bbContainer)

  return this.XMLSerializer.serializeToString(svg)
}

module.exports = Renderer
