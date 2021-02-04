const _ = require('lodash')
const { JSDOM } = require('jsdom')

function SVG() {
  this.document = new JSDOM('').window.document
}

SVG.prototype.update = function(element, attributes) {
  for (const [key, value] of Object.entries(attributes)) {
    element.setAttributeNS(null, key, value)
  }
}

SVG.prototype.createElement = function(type, attributes = null, children = null) {
  const element = this.document.createElementNS('http://www.w3.org/2000/svg', type)
  if (attributes) {
    this.update(element, attributes)
  }

  if (children) {
    this.appendChildren(element, children)
  }

  return element
}

SVG.prototype.appendChildren = function(element, children) {
  for (const child of children) {
    element.appendChild(child)
  }
}

SVG.prototype.correctBoundingBox = function(x, y, width, height) {
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

SVG.prototype.boundingBoxToRect = function(box) {
  const { x, y, width: w, height: h } = box
  return { top: y, bottom: y + h, left: x, right: x + w }
}

SVG.prototype.getBoxWithMaxArea = function(boxes) {
  if (boxes.length === 1) {
    return boxes[0]
  }

  const rects = boxes.map(bb => this.boundingBoxToRect(bb))

  const minY = Math.min(...rects.map(r => r.top))
  const maxY = Math.max(...rects.map(r => r.bottom))
  const minX = Math.min(...rects.map(r => r.left))
  const maxX = Math.max(...rects.map(r => r.right))
  const update = { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
  return Object.assign(boxes[0], update)
}

SVG.prototype.mergeBoundingBoxes = function(boxes) {
  const groups = _.groupBy(boxes, 'id')
  return Object.values(groups).map(g => this.getBoxWithMaxArea(g))
}

module.exports = SVG
