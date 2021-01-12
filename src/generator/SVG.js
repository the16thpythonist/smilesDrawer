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
    const element = this.document.createElementNS('http://www.w3.org/2000/svg', type)
    if (!attributes) {
        return element
    }

    this.update(element, attributes)
    return element
}

SVG.prototype.appendChildren = function(element, children){
    for (const child of children){
        element.appendChild(child)
    }
}


module.exports = SVG