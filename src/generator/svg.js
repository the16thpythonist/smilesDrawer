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
    bb.setAttributeNS(null, "style", `fill: none; stroke: #72${randomColor}; stroke-width: 0.5`)
    return bb
}

module.exports = {saveAsPngWithProperSize, propertiesFromXmlString, makeBoundingBox}