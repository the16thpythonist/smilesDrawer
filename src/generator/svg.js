const _ = require("lodash")

const Parser = require("../drawer/Parser")
const SvgDrawer = require("../drawer/SvgDrawer")

const jsdom = require("jsdom");
const {JSDOM} = jsdom;
const {document: jsdomDocument, XMLSerializer} = (new JSDOM(``)).window

const saveAsPngWithProperSize = async (browser, svg, size, fileName) => {
    const page = await browser.newPage();
    await page.setContent(svg, {waitUntil: 'domcontentloaded'})

    await page.evaluate((size) => {
        const svg = document.querySelector("svg")
        svg.setAttributeNS(null, "width", size)
        svg.setAttributeNS(null, "height", size)
    }, size)

    const svgEl = await page.$('svg');
    await svgEl.screenshot({path: fileName, omitBackground: false});
    await page.close()
}

const propertiesFromXmlString = async (browser, xml) => {
    const page = await browser.newPage();
    await page.setContent(xml, {waitUntil: 'domcontentloaded'})

    const dom = await page.evaluate(() => {
        const nodes = []
        const edges = []

        const vertices = document.documentElement.querySelectorAll("[vertex-id]")
        for (const vertex of vertices) {
            const {x, y, width, height} = vertex.getBBox()
            const elements = Array.from(vertex.querySelectorAll("tspan")).map(c => c.textContent).filter(c => !!c)
            const id = vertex.getAttribute("vertex-id")
            nodes.push({id, elements, x, y, width, height})
        }

        const bonds = document.documentElement.querySelectorAll("[edge-id]")
        for (const bond of bonds) {
            const {x, y, width, height} = bond.getBBox()
            const id = bond.getAttribute("edge-id")
            edges.push({id, x, y, width, height})
        }

        return {nodes, edges}
    })

    return {dom, xml}
}

const makeBoundingBox = (document, id, x, y, width, height) => {
    const bb = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
    // don't use all bits, otherwise sometimes bb might be white
    const randomColor = Math.floor(Math.random() * 16777215).toString(16).slice(-4)
    bb.setAttributeNS(null, "id", `${id}-bb`)
    bb.setAttributeNS(null, "x", x)
    bb.setAttributeNS(null, "y", y)
    bb.setAttributeNS(null, "width", width)
    bb.setAttributeNS(null, "height", height)
    bb.setAttributeNS(null, "style", `fill: none; stroke: #a2${randomColor}; stroke-width: 0.5`)
    return bb
}

const boundingBoxToRect = (bb) => {
    const {x, y, width: w, height: h} = bb
    return {top: y, bottom: y + h, left: x, right: x + w}
}

const getBoxWithMaxArea = (bond) => {
    if (bond.length === 1) {
        return bond[0]
    }
    const id = bond[0].id
    const rects = bond.map(bb => boundingBoxToRect(bb))

    const minY = Math.min(...rects.map(r => r.top))
    const maxY = Math.max(...rects.map(r => r.bottom))
    const minX = Math.min(...rects.map(r => r.left))
    const maxX = Math.max(...rects.map(r => r.right))

    return {id: id, x: minX, y: minY, width: maxX - minX, height: maxY - minY}
}

const mergeBoundingBoxes = function (boxes) {
    const groups = _.groupBy(boxes, "id")
    return Object.values(groups).map(getBoxWithMaxArea)
}

const correctBoundingBox = (x, y, width, height) => {
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

    return {x: xCorr, y: yCorr, width: widthCorr, height: heightCorr}
}

const createRawSvgFromSmiles = (smiles) => {
    const svg = jsdomDocument.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const size = 500

    svg.setAttributeNS(null, "smiles", smiles)
    svg.setAttributeNS(null, "width", size)
    svg.setAttributeNS(null, "height", size)

    const svgDrawer = new SvgDrawer({height: size, width: size});
    const tree = Parser.parse(smiles)
    svgDrawer.draw(tree, svg, 'light', false);

    return new XMLSerializer().serializeToString(svg);
}

const addBoundingBoxesToSvg = ({dom, xml}) => {
    const svg = new JSDOM(xml).window.document.documentElement.querySelector("svg")
    const bbContainer = jsdomDocument.createElementNS('http://www.w3.org/2000/svg', 'g')

    for (const {id, x, y, width, height} of dom.nodes) {
        const bb = makeBoundingBox(jsdomDocument, id, x, y, width, height)
        bbContainer.appendChild(bb)
    }

    const correctedEdges = dom.edges.map(({id, x, y, width, height}) => Object.assign({id: id}, correctBoundingBox(x, y, width, height)))
    const merged = mergeBoundingBoxes(correctedEdges)
    for (let {id, x, y, width, height} of merged) {
        const bb = makeBoundingBox(jsdomDocument, id, x, y, width, height)
        bbContainer.appendChild(bb)
    }

    svg.appendChild(bbContainer)

    return new XMLSerializer().serializeToString(svg)
}

module.exports = {
    saveAsPngWithProperSize, propertiesFromXmlString, makeBoundingBox,
    mergeBoundingBoxes, correctBoundingBox, createRawSvgFromSmiles,
    addBoundingBoxesToSvg
}