const { JSDOM } = require('jsdom')

function SVG () {
  this.document = new JSDOM('').window.document
}

SVG.prototype.update = function (element, attributes) {
  for (const [key, value] of Object.entries(attributes)) {
    element.setAttributeNS(null, key, value)
  }
}

SVG.prototype.createElement = function (type, attributes = null, children = null) {
  const element = this.document.createElementNS('http://www.w3.org/2000/svg', type)
  if (attributes) {
    this.update(element, attributes)
  }

  if (children) {
    this.appendChildren(element, children)
  }

  return element
}

SVG.prototype.appendChildren = function (element, children) {
  for (const child of children) {
    element.appendChild(child)
  }
}

module.exports = SVG
