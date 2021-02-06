const _ = require('lodash')
const Vector2 = require('../drawer/Vector2')
const { JSDOM } = require('jsdom')
const hull = require('hull.js')

const { bondLabels } = require('./types')

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
    if (Array.isArray(child)) {
      this.appendChildren(element, child)
      continue
    }

    element.appendChild(child)
  }
}

SVG.prototype.correctBoundingBox = function({ x, y, width, height }) {
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

SVG.prototype.getEdgePointsOfBoxAroundLine = function({ x1, y1, x2, y2 }) {
  const v1 = new Vector2(x1, y1)
  const v2 = new Vector2(x2, y2)
  const { x: dx, y: dy } = Vector2.subtract(v1, v2)

  if (dx === 0 && dy === 0) {
    return null
  }

  const [n1, n2] = Vector2.units(v1, v2).map(v => v.multiplyScalar(0.5))

  const points = [
    Vector2.add(v1, n1),
    Vector2.subtract(v1, n1),

    Vector2.add(v2, n2),
    Vector2.subtract(v2, n2)

  ]

  return points.map(p => [p.x, p.y])
}

SVG.prototype.randomColor = function(seed = 'a2') {
  const color = Math.floor(Math.random() * 16777215).toString(16).slice(-4)
  return `#${seed}${color}`
}

SVG.prototype.hull = function(edges) {
  // aneb: below code does not work for polygon, but points are already in place so no processing is needed
  if (edges[0].label === bondLabels.wedgeSolid) {
    edges[0].points = edges[0].points[0]
    return edges[0]
  }

  // aneb: this solution is super hacky but works ... :(
  const { x1: p11, y1: p12, x2: p21, y2: p22 } = edges[0]
  const { x1: p31, y1: p32, x2: p41, y2: p42 } = edges[0].label === bondLabels.triple ? edges.slice(-2)[0] : edges.slice(-1)[0]
  edges[0].points = hull([[p11, p12], [p21, p22], [p31, p32], [p41, p42]])
  return edges[0]
}

module.exports = SVG
