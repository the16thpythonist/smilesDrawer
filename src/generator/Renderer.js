const fs = require('fs-extra')
const puppeteer = require('puppeteer')
const _ = require('lodash')
const { JSDOM } = require('jsdom')

const Parser = require('../drawer/Parser')
const SvgDrawer = require('../drawer/SvgDrawer')
const SVG = require('./SVG')

const { boundingBoxesFromSvg, resizeImage } = require('./browser')

function Renderer({ outputDirectory, quality, scale, colors, concurrency }) {
  this.browser = null
  this.pages = null
  this.document = null
  this.XMLSerializer = null

  this.parser = Parser

  this.directory = outputDirectory
  this.quality = quality
  this.scale = scale
  this.concurrency = concurrency

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

Renderer.prototype.boundingBoxesFromSvgXml = async function(page, xml) {
  // aneb: need to open browser, getBBox is not available via jsdom as it does not render
  await page.setContent(xml, { waitUntil: 'domcontentloaded' })

  const dom = await page.evaluate(boundingBoxesFromSvg)

  return { dom, xml }
}

Renderer.prototype.saveResizedImage = async function(page, svg, fileName, quality) {
  await page.setContent(svg, { waitUntil: 'domcontentloaded' })

  let [updatedSvg, labels] = await page.evaluate(resizeImage, this.scale)

  const svgElAfter = await page.$('svg')

  await Promise.all([
    svgElAfter.screenshot({ path: `${fileName}.jpeg`, omitBackground: false, quality: quality }),
    fs.writeFile(`${fileName}.svg`, updatedSvg)
  ])

  if (labels.length) {
    labels = labels
      .map(pair => pair.reduce((p, c) => Object.assign(p, c), {}))
      .map(({ label, x, y, width, height }) => ({ label, x, y, width, height }))
    await fs.writeFile(`${fileName}.labels.json`, JSON.stringify(labels, null, 2))
  }
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

  const correctedEdges = dom.edges.map(({ id, label, x, y, width, height }) => Object.assign({ id, label }, this.correctBoundingBox(x, y, width, height)))
  const merged = this.mergeBoundingBoxes(correctedEdges)
  for (const { id, label, x, y, width, height } of merged) {
    const bb = this.makeBoundingBox(id, label, x, y, width, height)
    bbContainer.appendChild(bb)
  }

  svg.appendChild(bbContainer)

  return this.XMLSerializer.serializeToString(svg)
}

Renderer.prototype.imageFromSmilesString = async function(page, smiles, filePrefix, fileIndex) {
  const svgXmlWithoutBoundingBoxes = this.smilesToSvgXml(smiles)
  const { dom, xml } = await this.boundingBoxesFromSvgXml(page, svgXmlWithoutBoundingBoxes)

  // TODO aneb: define different styles of labels, then make style configurable
  const svgXmlWithBoundingBoxes = this.addBoundingBoxesToSvg({ dom, xml })

  const fileName = `${this.directory}/${filePrefix}-${fileIndex}`
  await this.saveResizedImage(page, svgXmlWithoutBoundingBoxes, `${fileName}-x-quality-${this.quality}`, this.quality)
  await this.saveResizedImage(page, svgXmlWithBoundingBoxes, `${fileName}-y-quality-${this.quality}`, 100)
}

Renderer.prototype.imagesFromSmilesList = async function(smilesList, filePrefix = 'img') {
  const n = this.concurrency

  let i = 0

  while (i < smilesList.length) {
    console.log(`processing items ${i} to ${i + n}`)

    const current = _.zip(this.pages, smilesList.slice(i, i + n)).filter(([_, smiles]) => !!smiles)
    await Promise.all(current.map(([page, smiles], fileIndex) => this.imageFromSmilesString(page, smiles, filePrefix, fileIndex + i)))

    i += n
  }
}

module.exports = Renderer
