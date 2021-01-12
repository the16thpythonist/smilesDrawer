const {JSDOM} = require("jsdom");

function SVG() {
    this.document = new JSDOM(``).window.document
}

SVG.prototype.update = function (element, attributes) {
    for (const [key, value] of Object.entries(attributes)) {
        element.setAttributeNS(null, key, value)
    }
}

SVG.prototype.createElement = function (type, attributes = null) {
    const el = this.document.createElementNS('http://www.w3.org/2000/svg', type)
    if (!attributes) {
        return el
    }

    this.update(el, attributes)
    return el
}


module.exports = SVG