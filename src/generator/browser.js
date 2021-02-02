function boundingBoxesFromSvg() {
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
}

function resizeImage(scale) {
  const svg = document.querySelector('svg')
  const [height, width, viewbox] = ['height', 'width', 'viewBox'].map(property => svg.getAttributeNS(null, property))
  const [boxX, boxY, boxWidth, boxHeight] = viewbox.split(' ')

  svg.setAttributeNS(null, 'height', Math.ceil(height * scale))
  svg.setAttributeNS(null, 'width', Math.ceil(width * scale))
  svg.setAttributeNS(null, 'viewbox', `${boxX} ${boxY} ${boxWidth * scale} ${boxHeight * scale} `)

  const elements = document.documentElement.querySelectorAll('[bb-id]')
  // aneb: find better way to do this?
  const labels = Array.from(elements).map(e => Array.from(e.attributes).map(e => ({ [e.name]: e.nodeValue })))

  // eslint-disable-next-line no-undef
  const updatedSvg = new XMLSerializer().serializeToString(svg)

  return [updatedSvg, labels]
}

module.exports = { boundingBoxesFromSvg, resizeImage }
