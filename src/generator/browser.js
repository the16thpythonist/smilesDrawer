function getPositionInfoFromSvg() {
  const nodes = []
  const edges = []

  const vertices = document.documentElement.querySelectorAll('[vertex-id]')
  for (const vertex of vertices) {
    const { x, y, width, height } = vertex.getBBox()
    const elements = Array.from(vertex.querySelectorAll('tspan')).map(c => c.textContent).filter(c => !!c)
    const id = vertex.getAttribute('vertex-id')
    const label = vertex.getAttribute('label')
    nodes.push({ id, label, elements, x, y, width, height })
  }

  const bonds = document.documentElement.querySelectorAll('[edge-id]')
  for (const bond of bonds) {
    const { x, y, width, height } = bond.getBBox()
    const id = bond.getAttribute('edge-id')
    const label = bond.getAttribute('label')
    const x1 = bond.getAttribute('x1')
    const y1 = bond.getAttribute('y1')
    const x2 = bond.getAttribute('x2')
    const y2 = bond.getAttribute('y2')

    const points = bond.getAttribute('points')
    edges.push({ id, label, x, y, width, height, x1, y1, x2, y2, points })
  }

  return { nodes, edges }
}

function resizeImage(scale) {
  // document.body.style.background = 'url("https://images.unsplash.com/photo-1566041510632-30055e21a9cf?ixid=MXwxMjA3fDB8MHxzZWFyY2h8Nnx8cGFwZXIlMjB0ZXh0dXJlfGVufDB8fDB8&ixlib=rb-1.2.1&w=1000&q=80")'
  // document.body.style.backgroundSize = 'cover'
  // document.body.style.backgroundRepeat = 'no-repeat'

  const svg = document.querySelector('svg')

  const [height, width] = ['height', 'width'].map(property => svg.getAttributeNS(null, property))

  // aneb: original viewbox must be preserved, inner coordinates are relative to it
  // changing width and height is the proper way to do it, rendering it will recognize the new proportions
  svg.setAttributeNS(null, 'height', Math.ceil(height * scale))
  svg.setAttributeNS(null, 'width', Math.ceil(width * scale))

  const elements = document.documentElement.querySelectorAll('[label-id]')
  // aneb: find better way to do this?
  const labels = Array.from(elements)
    .map(e => Array.from(e.attributes).map(e => ({ [e.name]: e.nodeValue })))
    .map(pair => pair.reduce((p, c) => Object.assign(p, c), {}))

  // eslint-disable-next-line no-undef
  const updatedSvg = new XMLSerializer().serializeToString(svg)

  // aneb: easiest way to make object out of it
  const { a, b, c, d, e, f } = svg.getScreenCTM()
  const matrix = { a, b, c, d, e, f }

  return [updatedSvg, labels, matrix]
}

module.exports = {
  getPositionInfoFromSvg,
  resizeImage
}
