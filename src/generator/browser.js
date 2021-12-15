function drawMasksAroundTextElements() {
  const svg = document.querySelector('svg')
  const mask = document.querySelector('mask')

  const vertices = document.documentElement.querySelectorAll('[vertex-id]')

  for (const vertex of vertices) {
    const { x, y, width, height } = vertex.getBBox()

    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect')

    const isRound = ['O', 'S'].some(v => vertex.textContent.trim().startsWith(v))
    const round = isRound ? 10 : 1

    rect.setAttributeNS(null, 'x', x)
    rect.setAttributeNS(null, 'y', y)
    rect.setAttributeNS(null, 'width', width)
    rect.setAttributeNS(null, 'height', height)
    rect.setAttributeNS(null, 'fill', 'black')

    rect.setAttributeNS(null, 'rx', round)
    rect.setAttributeNS(null, 'ry', round)

    mask.appendChild(rect)
  }
  // eslint-disable-next-line no-undef
  return new XMLSerializer().serializeToString(svg)
}

function getPositionInfoFromSvg() {
  const nodes = []
  const edges = []

  const vertices = document.documentElement.querySelectorAll('[vertex-id]')
  for (const vertex of vertices) {
    const { x, y, width, height } = vertex.getBBox()
    const elements = Array.from(vertex.querySelectorAll('tspan')).map(c => c.textContent).filter(c => !!c)
    const id = vertex.getAttribute('vertex-id')
    const label = vertex.getAttribute('label')
    const direction = vertex.getAttributeNS(null, 'direction')
    const children = Array.from(vertex.children).map(c => c.textContent)

    if (direction === 'up' || direction === 'left') {
      children.reverse()
    }

    const text = children.join('').replace(/\s/g, '')

    nodes.push({ id, label, elements, x, y, width, height, text })
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
    const text = 'n/a'
    const points = bond.getAttribute('points')
    edges.push({ id, label, x, y, width, height, x1, y1, x2, y2, points, text })
  }

  return { nodes, edges }
}

function resizeImage({ size, preserveAspectRatio }) {
  // document.body.style.background = 'url("https://images.unsplash.com/photo-1566041510632-30055e21a9cf?ixid=MXwxMjA3fDB8MHxzZWFyY2h8Nnx8cGFwZXIlMjB0ZXh0dXJlfGVufDB8fDB8&ixlib=rb-1.2.1&w=1000&q=80")'
  // document.body.style.backgroundSize = 'cover'
  // document.body.style.backgroundRepeat = 'no-repeat'

  const svg = document.querySelector('svg')

  // aneb: original viewbox must be preserved, inner coordinates are relative to it
  // changing width and height is the proper way to do it, rendering it will recognize the new proportions
  svg.setAttributeNS(null, 'height', size)
  svg.setAttributeNS(null, 'width', size)
  svg.setAttributeNS(null, 'preserveAspectRatio', preserveAspectRatio)

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
  resizeImage,
  drawMasksAroundTextElements
}
